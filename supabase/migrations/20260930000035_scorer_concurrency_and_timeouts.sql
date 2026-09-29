-- 20260930000035_scorer_concurrency_and_timeouts.sql
-- M35: Authoritative scoring concurrency serialization, repeated undo safety, and volleyball timeouts.

--------------------------------------------------------------------------------
-- 1. VOLLEYBALL RULES TIMEOUT EXTENSION
--------------------------------------------------------------------------------

ALTER TABLE public.volleyball_rules
  ADD COLUMN IF NOT EXISTS timeouts_per_set integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS timeout_duration_seconds integer NOT NULL DEFAULT 15;

--------------------------------------------------------------------------------
-- 2. DEDICATED MATCH TIMEOUTS TABLE
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.match_timeouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  match_set_id uuid NOT NULL REFERENCES public.match_sets(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  timeout_number integer NOT NULL CHECK (timeout_number >= 1),
  duration_seconds integer NOT NULL DEFAULT 15,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_set_id, team_id, timeout_number)
);

CREATE INDEX IF NOT EXISTS idx_match_timeouts_match_set ON public.match_timeouts(match_id, match_set_id);
CREATE INDEX IF NOT EXISTS idx_match_timeouts_active ON public.match_timeouts(match_id) WHERE ended_at IS NULL;

ALTER TABLE public.match_timeouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public and members can read match timeouts" ON public.match_timeouts;
CREATE POLICY "Public and members can read match timeouts"
  ON public.match_timeouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_timeouts.match_id
        AND (t.is_public OR public.is_tournament_member(m.tournament_id) OR public.is_assigned_scorer(m.id))
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.match_timeouts FROM anon, authenticated;

--------------------------------------------------------------------------------
-- 3. HARDENED award_point WITH ADVISORY LOCK & SEQUENCE SERIALIZATION
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.award_point(
  p_match_id uuid,
  p_team_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage_id uuid;
  v_match_status text;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_set_id uuid;
  v_set_number integer;
  v_home_score integer;
  v_away_score integer;
  v_target_points integer;
  v_rule_id uuid;
  v_win_by_two boolean;
  v_sets_to_win integer;
  v_sequence bigint;
  v_is_home boolean;
  v_set_winner uuid;
  v_existing_result jsonb;
  v_active_timeout record;
BEGIN
  -- 0. Validate Idempotency Key
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  -- 1. Exclusively serialize all scoring actions on this match domain
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));

  -- 2. Lock authoritative match row
  SELECT tournament_id, stage_id, status, home_team_id, away_team_id
  INTO v_tournament_id, v_stage_id, v_match_status, v_home_team_id, v_away_team_id
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to score this match';
  END IF;

  -- 3. In-transaction Idempotency Re-check after acquiring the lock
  IF EXISTS (SELECT 1 FROM public.score_events WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key) THEN
    SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id)
    INTO v_existing_result
    FROM public.match_sets WHERE match_id = p_match_id
    ORDER BY CASE WHEN status IN ('PENDING','LIVE') THEN 0 ELSE 1 END,
             CASE WHEN status IN ('PENDING','LIVE') THEN set_number ELSE -set_number END LIMIT 1;
    RETURN v_existing_result;
  END IF;

  -- 4. Check active timeout status
  SELECT id, started_at, duration_seconds INTO v_active_timeout
  FROM public.match_timeouts
  WHERE match_id = p_match_id AND ended_at IS NULL
  ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  IF v_active_timeout.id IS NOT NULL THEN
    IF now() >= v_active_timeout.started_at + (v_active_timeout.duration_seconds || ' seconds')::interval THEN
      -- Auto-expire elapsed visual timeout
      UPDATE public.match_timeouts
      SET ended_at = v_active_timeout.started_at + (v_active_timeout.duration_seconds || ' seconds')::interval
      WHERE id = v_active_timeout.id;
    ELSE
      RAISE EXCEPTION 'Cannot award point while a timeout is actively running';
    END IF;
  END IF;

  -- 5. Transition SCHEDULED -> LIVE atomically
  IF v_match_status <> 'LIVE' THEN
    IF v_match_status = 'SCHEDULED' THEN
      UPDATE public.matches SET status = 'LIVE', updated_at = now() WHERE id = p_match_id;
    ELSE
      RAISE EXCEPTION 'Match is not LIVE or SCHEDULED';
    END IF;
  END IF;

  IF p_team_id = v_home_team_id THEN
    v_is_home := true;
  ELSIF p_team_id = v_away_team_id THEN
    v_is_home := false;
  ELSE
    RAISE EXCEPTION 'Team is not part of this match';
  END IF;

  -- 6. Lock active set
  SELECT id, set_number, home_score, away_score, target_points
  INTO v_set_id, v_set_number, v_home_score, v_away_score, v_target_points
  FROM public.match_sets WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL THEN
    RAISE EXCEPTION 'No active set found';
  END IF;

  UPDATE public.match_sets SET status = 'LIVE', started_at = COALESCE(started_at, now())
  WHERE id = v_set_id;

  -- 7. Fetch Volleyball Rules
  SELECT id, sets_to_win, win_by_two INTO v_rule_id, v_sets_to_win, v_win_by_two
  FROM public.volleyball_rules
  WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;

  SELECT COALESCE(
    (SELECT target_points FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule_id AND set_number = v_set_number),
    v_target_points,
    25
  ) INTO v_target_points;

  -- 8. Increment score
  IF v_is_home THEN
    v_home_score := v_home_score + 1;
  ELSE
    v_away_score := v_away_score + 1;
  END IF;

  -- 9. Authoritative Sequence Number allocation
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence
  FROM public.score_events WHERE match_id = p_match_id;

  -- 10. Insert event into append-only log
  INSERT INTO public.score_events (
    match_id, match_set_id, sequence_number, event_type, team_id,
    home_score_after, away_score_after, idempotency_key, created_by
  ) VALUES (
    p_match_id, v_set_id, v_sequence, 'POINT', p_team_id,
    v_home_score, v_away_score, p_idempotency_key, auth.uid()
  );

  -- 11. Update set score
  UPDATE public.match_sets
  SET home_score = v_home_score, away_score = v_away_score
  WHERE id = v_set_id;

  -- 12. Generic volleyball deuce / set completion check
  IF (v_is_home AND v_home_score >= v_target_points AND (NOT COALESCE(v_win_by_two, true) OR (v_home_score - v_away_score) >= 2)) THEN
    v_set_winner := v_home_team_id;
  ELSIF (NOT v_is_home AND v_away_score >= v_target_points AND (NOT COALESCE(v_win_by_two, true) OR (v_away_score - v_home_score) >= 2)) THEN
    v_set_winner := v_away_team_id;
  END IF;

  IF v_set_winner IS NOT NULL THEN
    UPDATE public.match_sets
    SET status = 'COMPLETED', winner_team_id = v_set_winner, completed_at = now()
    WHERE id = v_set_id;

    -- Evaluate Match Completion
    DECLARE
      v_home_sets_won integer;
      v_away_sets_won integer;
    BEGIN
      SELECT COUNT(*) INTO v_home_sets_won FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_home_team_id;
      SELECT COUNT(*) INTO v_away_sets_won FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_away_team_id;

      IF v_home_sets_won >= COALESCE(v_sets_to_win, 2) THEN
        UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_home_team_id, updated_at = now() WHERE id = p_match_id;
      ELSIF v_away_sets_won >= COALESCE(v_sets_to_win, 2) THEN
        UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_away_team_id, updated_at = now() WHERE id = p_match_id;
      ELSE
        -- Auto-activate next pending set
        UPDATE public.match_sets
        SET status = 'LIVE', started_at = now()
        WHERE match_id = p_match_id AND set_number = v_set_number + 1 AND status = 'PENDING';
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score, 'set_winner', v_set_winner);
END;
$$;

--------------------------------------------------------------------------------
-- 4. HARDENED undo_last_score_event WITH SERIALIZATION & CHRONOLOGICAL STEPPING
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.undo_last_score_event(
  p_match_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_match_status text;
  v_set_id uuid;
  v_active_set_number integer;
  v_active_set_status text;
  v_new_home_score integer;
  v_new_away_score integer;
  v_next_sequence bigint;
  v_team_undone uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
BEGIN
  -- 1. Exclusively serialize all scoring actions on this match domain
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));

  -- 2. Lock authoritative match row
  SELECT tournament_id, status, home_team_id, away_team_id
  INTO v_tournament_id, v_match_status, v_home_team_id, v_away_team_id
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to score this match';
  END IF;

  IF v_match_status = 'COMPLETED' AND NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Only an organizer can undo points in a completed match';
  END IF;

  -- 3. Calculate sequence number across the entire append-only event log
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_next_sequence
  FROM public.score_events WHERE match_id = p_match_id;

  -- 4. Find the set currently active or most recently completed
  SELECT id, set_number, home_score, away_score, status
  INTO v_set_id, v_active_set_number, v_new_home_score, v_new_away_score, v_active_set_status
  FROM public.match_sets
  WHERE match_id = p_match_id AND (home_score > 0 OR away_score > 0 OR status = 'LIVE')
  ORDER BY set_number DESC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL OR (v_new_home_score = 0 AND v_new_away_score = 0) THEN
    RAISE EXCEPTION 'No score event found to undo';
  END IF;

  -- 5. Determine which team scored the last active point in this set
  -- Inspect the latest non-undone event chronologically
  SELECT team_id INTO v_team_undone
  FROM public.score_events
  WHERE match_id = p_match_id AND match_set_id = v_set_id
  ORDER BY sequence_number DESC LIMIT 1;

  IF v_team_undone IS NULL THEN
    -- Fallback: check scores
    IF v_new_home_score > 0 THEN v_team_undone := v_home_team_id;
    ELSE v_team_undone := v_away_team_id; END IF;
  END IF;

  -- Decrement appropriate score
  IF v_team_undone = v_home_team_id AND v_new_home_score > 0 THEN
    v_new_home_score := v_new_home_score - 1;
  ELSIF v_new_away_score > 0 THEN
    v_new_away_score := v_new_away_score - 1;
    v_team_undone := v_away_team_id;
  ELSE
    v_new_home_score := v_new_home_score - 1;
    v_team_undone := v_home_team_id;
  END IF;

  -- 6. Insert append-only UNDO event
  INSERT INTO public.score_events (
    match_id, match_set_id, sequence_number, event_type, team_id,
    home_score_after, away_score_after, created_by
  ) VALUES (
    p_match_id, v_set_id, v_next_sequence, 'UNDO', v_team_undone,
    v_new_home_score, v_new_away_score, auth.uid()
  );

  -- 7. Restore set state
  UPDATE public.match_sets
  SET home_score = v_new_home_score,
      away_score = v_new_away_score,
      status = 'LIVE',
      winner_team_id = NULL,
      completed_at = NULL
  WHERE id = v_set_id;

  -- If a subsequent set had been activated, revert it back to PENDING
  UPDATE public.match_sets
  SET status = 'PENDING', started_at = NULL, home_score = 0, away_score = 0
  WHERE match_id = p_match_id AND set_number > v_active_set_number;

  -- Ensure match state is reverted if it was completed
  IF v_match_status = 'COMPLETED' THEN
    UPDATE public.matches SET status = 'LIVE', winner_team_id = NULL, updated_at = now() WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('home_score', v_new_home_score, 'away_score', v_new_away_score);
END;
$$;

--------------------------------------------------------------------------------
-- 5. TIMEOUT RPCs
--------------------------------------------------------------------------------

-- Call timeout for a team
CREATE OR REPLACE FUNCTION public.call_match_timeout(
  p_match_id uuid,
  p_team_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage_id uuid;
  v_match_status text;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_set_id uuid;
  v_rule_id uuid;
  v_max_timeouts integer;
  v_duration integer;
  v_used_timeouts integer;
  v_active_id uuid;
  v_active_team_id uuid;
  v_active_started timestamptz;
  v_active_duration integer;
  v_new_id uuid;
  v_started_at timestamptz := now();
BEGIN
  -- 1. Exclusively serialize all scoring/timeout actions on this match domain
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));

  -- 2. Lock authoritative match row
  SELECT tournament_id, stage_id, status, home_team_id, away_team_id
  INTO v_tournament_id, v_stage_id, v_match_status, v_home_team_id, v_away_team_id
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to call timeout for this match';
  END IF;

  IF p_team_id <> v_home_team_id AND p_team_id <> v_away_team_id THEN
    RAISE EXCEPTION 'Team is not part of this match';
  END IF;

  -- 3. Lock active set
  SELECT id INTO v_set_id
  FROM public.match_sets
  WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL THEN
    RAISE EXCEPTION 'No active set found';
  END IF;

  -- 4. Check if a timeout is ALREADY running
  SELECT id, team_id, started_at, duration_seconds
  INTO v_active_id, v_active_team_id, v_active_started, v_active_duration
  FROM public.match_timeouts
  WHERE match_id = p_match_id AND ended_at IS NULL
  ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  IF v_active_id IS NOT NULL THEN
    IF now() < v_active_started + (v_active_duration || ' seconds')::interval THEN
      -- Already active, return existing state safely (idempotent for double taps)
      RETURN jsonb_build_object(
        'ok', true,
        'timeout_id', v_active_id,
        'team_id', v_active_team_id,
        'already_active', true,
        'started_at', v_active_started,
        'duration_seconds', v_active_duration
      );
    ELSE
      -- Elapsed, close it out
      UPDATE public.match_timeouts
      SET ended_at = v_active_started + (v_active_duration || ' seconds')::interval
      WHERE id = v_active_id;
    END IF;
  END IF;

  -- 5. Read rule configuration
  SELECT id, timeouts_per_set, timeout_duration_seconds
  INTO v_rule_id, v_max_timeouts, v_duration
  FROM public.volleyball_rules
  WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;

  v_max_timeouts := COALESCE(v_max_timeouts, 2);
  v_duration := COALESCE(v_duration, 15);

  -- 6. Check allowance for this team in this set
  SELECT count(*) INTO v_used_timeouts
  FROM public.match_timeouts
  WHERE match_set_id = v_set_id AND team_id = p_team_id;

  IF v_used_timeouts >= v_max_timeouts THEN
    RAISE EXCEPTION 'Team has already used all allowed timeouts for this set';
  END IF;

  -- 7. Insert authoritative timeout
  INSERT INTO public.match_timeouts (
    match_id, match_set_id, team_id, timeout_number, duration_seconds, started_at, created_by
  ) VALUES (
    p_match_id, v_set_id, p_team_id, v_used_timeouts + 1, v_duration, v_started_at, auth.uid()
  ) RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'timeout_id', v_new_id,
    'team_id', p_team_id,
    'timeout_number', v_used_timeouts + 1,
    'duration_seconds', v_duration,
    'started_at', v_started_at
  );
END;
$$;

-- End an active timeout early
CREATE OR REPLACE FUNCTION public.end_match_timeout(
  p_match_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_timeout_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));

  -- Lock the same authoritative row used by scoring before checking whether
  -- ending the timeout is allowed. The advisory lock is the shared primary
  -- serialization mechanism; this row lock is defense in depth.
  SELECT tournament_id INTO v_tournament_id
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to manage timeouts for this match';
  END IF;

  SELECT id INTO v_timeout_id
  FROM public.match_timeouts
  WHERE match_id = p_match_id AND ended_at IS NULL
  ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  IF v_timeout_id IS NOT NULL THEN
    UPDATE public.match_timeouts SET ended_at = now() WHERE id = v_timeout_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'ended', v_timeout_id IS NOT NULL);
END;
$$;

--------------------------------------------------------------------------------
-- 6. ENRICHED get_scorer_match_state WITH TIMEOUT CONTEXT
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_scorer_match_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_stage_id uuid;
  v_state jsonb;
  v_active_set_id uuid;
  v_max_timeouts integer;
  v_duration integer;
  v_active_timeout jsonb;
  v_home_id uuid;
  v_away_id uuid;
  v_home_timeouts integer := 0;
  v_away_timeouts integer := 0;
BEGIN
  SELECT tournament_id, stage_id, home_team_id, away_team_id
  INTO v_tournament_id, v_stage_id, v_home_id, v_away_id
  FROM public.matches WHERE id = p_match_id;

  IF v_tournament_id IS NULL OR NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Find active set
  SELECT id INTO v_active_set_id
  FROM public.match_sets WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1;

  -- Read rule config
  SELECT timeouts_per_set, timeout_duration_seconds INTO v_max_timeouts, v_duration
  FROM public.volleyball_rules
  WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST LIMIT 1;

  v_max_timeouts := COALESCE(v_max_timeouts, 2);
  v_duration := COALESCE(v_duration, 15);

  IF v_active_set_id IS NOT NULL THEN
    SELECT count(*) INTO v_home_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_home_id;
    SELECT count(*) INTO v_away_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_away_id;
  END IF;

  -- Active running timeout
  SELECT jsonb_build_object(
    'id', mt.id,
    'team_id', mt.team_id,
    'timeout_number', mt.timeout_number,
    'duration_seconds', mt.duration_seconds,
    'started_at', mt.started_at,
    'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (mt.started_at + (mt.duration_seconds || ' seconds')::interval - now()))::integer)
  ) INTO v_active_timeout
  FROM public.match_timeouts mt
  WHERE mt.match_id = p_match_id AND mt.ended_at IS NULL
    AND now() < mt.started_at + (mt.duration_seconds || ' seconds')::interval
  ORDER BY mt.started_at DESC LIMIT 1;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('id', m.id, 'tournament_id', m.tournament_id, 'stage_id', m.stage_id, 'status', m.status, 'match_number', m.match_number, 'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'home_team', jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name),
    'away_team', jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name),
    'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'set_number', ms.set_number, 'target_points', ms.target_points, 'home_score', ms.home_score, 'away_score', ms.away_score, 'status', ms.status, 'winner_team_id', ms.winner_team_id) ORDER BY ms.set_number) FROM public.match_sets ms WHERE ms.match_id = m.id), '[]'::jsonb),
    'timeouts', jsonb_build_object(
      'max_per_set', v_max_timeouts,
      'duration_seconds', v_duration,
      'home_used', v_home_timeouts,
      'away_used', v_away_timeouts,
      'active', v_active_timeout
    )
  ) INTO v_state
  FROM public.matches m
  JOIN public.teams ht ON ht.id = m.home_team_id
  JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = p_match_id;

  RETURN v_state;
END;
$$;

--------------------------------------------------------------------------------
-- 7. GRANT PERMISSIONS
--------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.award_point(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_point(uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_last_score_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_last_score_event(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.call_match_timeout(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_match_timeout(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.end_match_timeout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_match_timeout(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_scorer_match_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_scorer_match_state(uuid) TO authenticated;
