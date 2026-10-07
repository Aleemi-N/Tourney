-- Scorer fixes:
-- 1. 20260930000036 dropped the tournament-creator branch of is_tournament_member (same regression
--    as is_tournament_organizer, restored in 20261007000057).
-- 2. Organizers opening a match no longer get auto-assigned as its scorer (it locked out the real scorer).
-- 3. Undo replays the set log instead of reading the newest row, which after one undo is the UNDO itself,
--    and skips an empty just-started set so a set-winning point can be undone.
-- 4. Unassigned match links only open for the tournament's SCORER staff (20261002000044 allowed any
--    logged-in user to claim and score them).
-- 5. Undoing the last point of a finished knockout match takes the advanced teams back out of the
--    next matches (refused once those have started), reopens the stage/tournament, and is refused
--    for a league whose next stage was already created from its standings.

CREATE OR REPLACE FUNCTION public.is_assigned_scorer(m_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $
  SELECT EXISTS (
    SELECT 1 FROM public.match_scorers
    WHERE match_id = m_id AND user_id = (SELECT auth.uid())
  ) OR (
    NOT EXISTS (SELECT 1 FROM public.match_scorers WHERE match_id = m_id)
    AND EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.tournament_members tm ON tm.tournament_id = m.tournament_id
      WHERE m.id = m_id AND tm.user_id = (SELECT auth.uid()) AND tm.role = 'SCORER' AND tm.status = 'ACTIVE'
    )
  );
$;

CREATE OR REPLACE FUNCTION public.is_tournament_member(tourn_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = tourn_id
      AND (t.created_by = (SELECT auth.uid()) OR EXISTS (
        SELECT 1 FROM public.tournament_members tm
        WHERE tm.tournament_id = t.id AND tm.user_id = (SELECT auth.uid()) AND tm.status = 'ACTIVE'
      ))
  );
$$;

CREATE OR REPLACE FUNCTION public.get_scorer_match_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
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
  v_actor uuid := auth.uid();
BEGIN
  SELECT tournament_id, stage_id, home_team_id, away_team_id
  INTO v_tournament_id, v_stage_id, v_home_id, v_away_id
  FROM public.matches WHERE id = p_match_id;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  -- Auto-assign the first tournament scorer who opens an unassigned match link. Organizers are never
  -- auto-assigned, so previewing a match does not lock out the real scorer.
  IF v_actor IS NOT NULL
     AND NOT public.is_tournament_organizer(v_tournament_id)
     AND NOT EXISTS (SELECT 1 FROM public.match_scorers WHERE match_id = p_match_id)
     AND EXISTS (SELECT 1 FROM public.tournament_members WHERE tournament_id = v_tournament_id AND user_id = v_actor AND role = 'SCORER' AND status = 'ACTIVE') THEN
    INSERT INTO public.match_scorers (match_id, user_id, assigned_by)
    VALUES (p_match_id, v_actor, v_actor)
    ON CONFLICT (match_id, user_id) DO NOTHING;
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
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

    SELECT count(*) INTO v_home_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_home_id;
    SELECT count(*) INTO v_away_timeouts FROM public.match_timeouts WHERE match_set_id = v_active_set_id AND team_id = v_away_id;
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', m.id,
      'tournament_id', m.tournament_id,
      'stage_id', m.stage_id,
      'status', m.status,
      'match_number', m.match_number,
      'scheduled_at', m.scheduled_at,
      'venue', m.venue,
      'court', m.court
    ),
    'home_team', jsonb_build_object(
      'id', ht.id,
      'name', ht.name,
      'short_name', ht.short_name
    ),
    'away_team', jsonb_build_object(
      'id', at.id,
      'name', at.name,
      'short_name', at.short_name
    ),
    'sets', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ms.id,
            'set_number', ms.set_number,
            'target_points', ms.target_points,
            'home_score', ms.home_score,
            'away_score', ms.away_score,
            'status', ms.status,
            'winner_team_id', ms.winner_team_id
          ) ORDER BY ms.set_number
        ) FROM public.match_sets ms WHERE ms.match_id = m.id
      ),
      '[]'::jsonb
    ),
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
  v_stack uuid[] := '{}';
  v_event record;
  v_match public.matches%ROWTYPE;
  v_next record;
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
  WHERE match_id = p_match_id AND (home_score > 0 OR away_score > 0)
  ORDER BY set_number DESC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL OR (v_new_home_score = 0 AND v_new_away_score = 0) THEN
    RAISE EXCEPTION 'No score event found to undo';
  END IF;

  -- 5. Replay the set log: each UNDO cancels the latest remaining POINT, so the top of the
  -- stack is the point to undo now (the newest row may itself be an UNDO).
  FOR v_event IN
    SELECT event_type, team_id FROM public.score_events
    WHERE match_id = p_match_id AND match_set_id = v_set_id
    ORDER BY sequence_number
  LOOP
    IF v_event.event_type = 'POINT' THEN
      v_stack := v_stack || v_event.team_id;
    ELSIF v_event.event_type = 'UNDO' AND cardinality(v_stack) > 0 THEN
      v_stack := v_stack[1:cardinality(v_stack) - 1];
    END IF;
  END LOOP;
  v_team_undone := v_stack[cardinality(v_stack)];

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

  -- Reopen a completed match and roll back what its result already caused.
  IF v_match_status = 'COMPLETED' THEN
    SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;

    IF EXISTS (SELECT 1 FROM public.tournament_progression_plans WHERE source_stage_id = v_match.stage_id) THEN
      RAISE EXCEPTION 'This league result is locked: the next stage was already created from these standings';
    END IF;

    FOR v_next IN
      SELECT nm.id, nm.status, x.slot
      FROM (VALUES (v_match.next_match_id, v_match.next_match_slot),
                   (v_match.loser_next_match_id, v_match.loser_next_match_slot)) AS x(id, slot)
      JOIN public.matches nm ON nm.id = x.id
      FOR UPDATE OF nm
    LOOP
      IF v_next.status <> 'SCHEDULED' OR EXISTS (SELECT 1 FROM public.score_events WHERE match_id = v_next.id) THEN
        RAISE EXCEPTION 'The next knockout match has already started, so this result can no longer be undone';
      END IF;
      UPDATE public.matches
      SET home_team_id = CASE WHEN v_next.slot = 'HOME' THEN NULL ELSE home_team_id END,
          away_team_id = CASE WHEN v_next.slot = 'AWAY' THEN NULL ELSE away_team_id END,
          updated_at = now()
      WHERE id = v_next.id;
    END LOOP;

    UPDATE public.matches SET status = 'LIVE', winner_team_id = NULL, updated_at = now() WHERE id = p_match_id;
    UPDATE public.tournament_stages SET status = 'ACTIVE' WHERE id = v_match.stage_id AND status = 'COMPLETED';
    UPDATE public.tournaments SET status = 'LIVE', updated_at = now() WHERE id = v_tournament_id AND status = 'COMPLETED';
  END IF;

  RETURN jsonb_build_object('home_score', v_new_home_score, 'away_score', v_new_away_score);
END;
$$;
