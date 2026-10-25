-- v2: BO1/BO3/BO5 per stage and per match.
--
-- Each match now carries its own format (sets_to_win, win_by_two) next to its
-- match_sets rows, so changing a stage rule never rewrites a match in progress.
-- A stage or default rule change re-syncs only matches that have not started;
-- the organizer can override a single match, even mid-match, as long as the new
-- format does not decide a set or the match by itself.

ALTER TABLE public.matches
  ADD COLUMN sets_to_win integer CONSTRAINT matches_sets_to_win_positive CHECK (sets_to_win > 0),
  ADD COLUMN win_by_two boolean,
  ADD COLUMN format_override boolean NOT NULL DEFAULT false;

-- The rule that applies to a stage: its own, else the tournament default.
CREATE FUNCTION public.stage_rule_id(p_tournament_id uuid, p_stage_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT id FROM public.volleyball_rules
  WHERE tournament_id = p_tournament_id AND (stage_id = p_stage_id OR stage_id IS NULL)
  ORDER BY stage_id NULLS LAST
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.stage_rule_id(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Brings a match's sets in line with a format. Completed sets are never touched;
-- the live set keeps its score and only accepts a target it has not reached yet.
-- Internal: callers check permissions.
CREATE FUNCTION public.sync_match_sets(p_match_id uuid, p_sets_to_win integer, p_win_by_two boolean, p_targets integer[])
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_needed integer;
  v_home_won integer;
  v_away_won integer;
  v_set public.match_sets%ROWTYPE;
  v_target integer;
BEGIN
  IF p_sets_to_win IS NULL OR p_sets_to_win < 1 THEN
    RAISE EXCEPTION 'Sets to win must be at least 1';
  END IF;
  v_needed := 2 * p_sets_to_win - 1;

  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;
  IF v_match.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'The format of a finished match cannot change';
  END IF;

  SELECT count(*) FILTER (WHERE winner_team_id = v_match.home_team_id),
         count(*) FILTER (WHERE winner_team_id = v_match.away_team_id)
  INTO v_home_won, v_away_won
  FROM public.match_sets WHERE match_id = p_match_id AND status = 'COMPLETED';
  IF GREATEST(v_home_won, v_away_won) >= p_sets_to_win THEN
    RAISE EXCEPTION 'Best of % would end this match at % sets to %', v_needed, v_home_won, v_away_won;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_sets ms
    WHERE ms.match_id = p_match_id AND ms.set_number > v_needed
      AND (ms.status <> 'PENDING' OR ms.home_score + ms.away_score > 0
           OR EXISTS (SELECT 1 FROM public.score_events e WHERE e.match_set_id = ms.id))
  ) THEN
    RAISE EXCEPTION 'Sets already played would fall outside best of %', v_needed;
  END IF;
  DELETE FROM public.match_sets WHERE match_id = p_match_id AND set_number > v_needed;

  FOR i IN 1..v_needed LOOP
    v_target := COALESCE(p_targets[i], CASE WHEN i = v_needed AND v_needed > 1 THEN 15 ELSE 25 END);
    SELECT * INTO v_set FROM public.match_sets WHERE match_id = p_match_id AND set_number = i;
    IF v_set.id IS NULL THEN
      INSERT INTO public.match_sets (match_id, set_number, target_points) VALUES (p_match_id, i, v_target);
    ELSIF v_set.status <> 'COMPLETED'
      AND (v_set.target_points <> v_target OR v_match.win_by_two IS DISTINCT FROM p_win_by_two) THEN
      IF GREATEST(v_set.home_score, v_set.away_score) >= v_target THEN
        RAISE EXCEPTION 'Set % is already at % points, so it cannot change to a %-point set',
          i, GREATEST(v_set.home_score, v_set.away_score), v_target;
      END IF;
      UPDATE public.match_sets SET target_points = v_target WHERE id = v_set.id;
    END IF;

  END LOOP;

  UPDATE public.matches
  SET sets_to_win = p_sets_to_win, win_by_two = p_win_by_two, updated_at = now()
  WHERE id = p_match_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_match_sets(uuid, integer, boolean, integer[]) FROM PUBLIC, anon, authenticated;

-- Sets up (or re-syncs) a match from its effective format: its own override,
-- else the stage rule.
CREATE OR REPLACE FUNCTION public.initialize_match_sets(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_rule public.volleyball_rules%ROWTYPE;
  v_targets integer[];
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;

  SELECT * INTO v_rule FROM public.volleyball_rules WHERE id = public.stage_rule_id(v_match.tournament_id, v_match.stage_id);
  IF v_rule.id IS NULL THEN RAISE EXCEPTION 'Volleyball rules are required before fixture generation'; END IF;
  SELECT array_agg(target_points ORDER BY set_number) INTO v_targets
  FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule.id;

  IF v_match.format_override THEN
    PERFORM public.sync_match_sets(p_match_id, v_match.sets_to_win, v_match.win_by_two,
      public.format_targets(v_match.sets_to_win, v_targets));
  ELSE
    PERFORM public.sync_match_sets(p_match_id, v_rule.sets_to_win, v_rule.win_by_two, v_targets);
  END IF;
END;
$$;

-- Targets for an overridden format, following the stage's pattern: regular sets
-- use the stage's first-set target, the deciding set its last-set target.
CREATE FUNCTION public.format_targets(p_sets_to_win integer, p_stage_targets integer[])
RETURNS integer[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_agg(
    CASE WHEN i = 2 * p_sets_to_win - 1 AND p_sets_to_win > 1
      THEN CASE WHEN cardinality(p_stage_targets) > 1 THEN p_stage_targets[cardinality(p_stage_targets)] ELSE 15 END
      ELSE COALESCE(p_stage_targets[1], 25)
    END ORDER BY i)
  FROM generate_series(1, 2 * p_sets_to_win - 1) AS i;
$$;

-- Organizer: choose a match's format, or pass NULL to follow the stage again.
CREATE FUNCTION public.set_match_format(p_match_id uuid, p_sets_to_win integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_rule public.volleyball_rules%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL OR NOT public.is_tournament_organizer(v_match.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_sets_to_win IS NOT NULL AND p_sets_to_win NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Choose best of 1, 3, 5, 7 or 9';
  END IF;

  SELECT * INTO v_rule FROM public.volleyball_rules WHERE id = public.stage_rule_id(v_match.tournament_id, v_match.stage_id);
  IF v_rule.id IS NULL THEN RAISE EXCEPTION 'Set the stage format first'; END IF;

  UPDATE public.matches
  SET format_override = p_sets_to_win IS NOT NULL,
      sets_to_win = COALESCE(p_sets_to_win, sets_to_win),
      win_by_two = COALESCE(win_by_two, v_rule.win_by_two)
  WHERE id = p_match_id;
  PERFORM public.initialize_match_sets(p_match_id);

  INSERT INTO public.audit_logs (organization_id, tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason)
  SELECT t.organization_id, v_match.tournament_id, auth.uid(), 'MATCH_FORMAT_CHANGED', 'MATCH', v_match.id,
         jsonb_build_object('sets_to_win', v_match.sets_to_win, 'format_override', v_match.format_override),
         jsonb_build_object('sets_to_win', m.sets_to_win, 'format_override', m.format_override),
         'Match format changed by tournament organizer'
  FROM public.tournaments t, public.matches m
  WHERE t.id = v_match.tournament_id AND m.id = v_match.id;

  RETURN (SELECT jsonb_build_object('match_id', id, 'sets_to_win', sets_to_win, 'format_override', format_override)
          FROM public.matches WHERE id = p_match_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_match_format(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_match_format(uuid, integer) TO authenticated;

-- Rules can now change at any time: they apply to matches that have not started.
CREATE OR REPLACE FUNCTION public.save_volleyball_rule(p_tournament_id uuid, p_stage_id uuid, p_sets_to_win integer, p_win_by_two boolean, p_set_rules jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_rule_id uuid; v_rule_count integer; v_max_set integer; v_match_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE id = p_stage_id AND tournament_id = p_tournament_id) THEN RAISE EXCEPTION 'Stage must belong to the same tournament'; END IF;
  IF p_sets_to_win <= 0 OR jsonb_typeof(p_set_rules) <> 'array' THEN RAISE EXCEPTION 'Invalid volleyball rule'; END IF;
  SELECT count(*), max((item->>'set_number')::integer) INTO v_rule_count, v_max_set FROM jsonb_array_elements(p_set_rules) item;
  IF v_rule_count < (p_sets_to_win * 2 - 1) OR v_max_set < (p_sets_to_win * 2 - 1) THEN RAISE EXCEPTION 'Set definitions do not cover the match format'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_set_rules) item WHERE (item->>'set_number')::integer <= 0 OR (item->>'target_points')::integer <= 0) THEN RAISE EXCEPTION 'Set numbers and target points must be positive'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_set_rules) item GROUP BY (item->>'set_number')::integer HAVING count(*) > 1) THEN RAISE EXCEPTION 'Set numbers must be unique'; END IF;

  SELECT id INTO v_rule_id FROM public.volleyball_rules
  WHERE tournament_id = p_tournament_id AND stage_id IS NOT DISTINCT FROM p_stage_id FOR UPDATE;
  IF v_rule_id IS NULL THEN
    INSERT INTO public.volleyball_rules (tournament_id, stage_id, sets_to_win, win_by_two)
    VALUES (p_tournament_id, p_stage_id, p_sets_to_win, p_win_by_two) RETURNING id INTO v_rule_id;
  ELSE
    UPDATE public.volleyball_rules SET sets_to_win = p_sets_to_win, win_by_two = p_win_by_two, updated_at = now() WHERE id = v_rule_id;
    DELETE FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule_id;
  END IF;
  INSERT INTO public.volleyball_set_rules (volleyball_rule_id, set_number, target_points)
  SELECT v_rule_id, (item->>'set_number')::integer, (item->>'target_points')::integer FROM jsonb_array_elements(p_set_rules) item;

  FOR v_match_id IN
    SELECT m.id FROM public.matches m
    WHERE m.tournament_id = p_tournament_id
      AND m.status IN ('SCHEDULED', 'POSTPONED')
      AND NOT EXISTS (SELECT 1 FROM public.score_events e WHERE e.match_id = m.id)
      AND public.stage_rule_id(m.tournament_id, m.stage_id) = v_rule_id
  LOOP
    PERFORM public.initialize_match_sets(v_match_id);
  END LOOP;
  RETURN v_rule_id;
END;
$$;

-- award_point reads the match's own format and the set's own target.
CREATE OR REPLACE FUNCTION public.award_point(p_match_id uuid, p_team_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  v_win_by_two boolean;
  v_sets_to_win integer;
  v_sequence bigint;
  v_is_home boolean;
  v_set_winner uuid;
  v_existing_result jsonb;
  v_active_timeout record;
  v_home_sets_won integer;
  v_away_sets_won integer;
BEGIN
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));

  SELECT tournament_id, stage_id, status, home_team_id, away_team_id, sets_to_win, win_by_two
  INTO v_tournament_id, v_stage_id, v_match_status, v_home_team_id, v_away_team_id, v_sets_to_win, v_win_by_two
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to score this match';
  END IF;

  IF EXISTS (SELECT 1 FROM public.score_events WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key) THEN
    SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id)
    INTO v_existing_result
    FROM public.match_sets WHERE match_id = p_match_id
    ORDER BY CASE WHEN status IN ('PENDING','LIVE') THEN 0 ELSE 1 END,
             CASE WHEN status IN ('PENDING','LIVE') THEN set_number ELSE -set_number END LIMIT 1;
    RETURN v_existing_result;
  END IF;

  SELECT id, started_at, duration_seconds INTO v_active_timeout
  FROM public.match_timeouts
  WHERE match_id = p_match_id AND ended_at IS NULL
  ORDER BY started_at DESC LIMIT 1 FOR UPDATE;

  IF v_active_timeout.id IS NOT NULL THEN
    IF now() >= v_active_timeout.started_at + (v_active_timeout.duration_seconds || ' seconds')::interval THEN
      UPDATE public.match_timeouts
      SET ended_at = v_active_timeout.started_at + (v_active_timeout.duration_seconds || ' seconds')::interval
      WHERE id = v_active_timeout.id;
    ELSE
      RAISE EXCEPTION 'Cannot award point while a timeout is actively running';
    END IF;
  END IF;

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

  SELECT id, set_number, home_score, away_score, target_points
  INTO v_set_id, v_set_number, v_home_score, v_away_score, v_target_points
  FROM public.match_sets WHERE match_id = p_match_id AND status IN ('PENDING', 'LIVE')
  ORDER BY set_number ASC LIMIT 1 FOR UPDATE;

  IF v_set_id IS NULL THEN
    RAISE EXCEPTION 'No active set found';
  END IF;

  UPDATE public.match_sets SET status = 'LIVE', started_at = COALESCE(started_at, now())
  WHERE id = v_set_id;

  -- Matches created before per-match formats fall back to the stage rule.
  IF v_sets_to_win IS NULL THEN
    SELECT sets_to_win, win_by_two INTO v_sets_to_win, v_win_by_two
    FROM public.volleyball_rules WHERE id = public.stage_rule_id(v_tournament_id, v_stage_id);
  END IF;
  v_target_points := COALESCE(v_target_points, 25);

  IF v_is_home THEN
    v_home_score := v_home_score + 1;
  ELSE
    v_away_score := v_away_score + 1;
  END IF;

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence
  FROM public.score_events WHERE match_id = p_match_id;

  INSERT INTO public.score_events (
    match_id, match_set_id, sequence_number, event_type, team_id,
    home_score_after, away_score_after, idempotency_key, created_by
  ) VALUES (
    p_match_id, v_set_id, v_sequence, 'POINT', p_team_id,
    v_home_score, v_away_score, p_idempotency_key, auth.uid()
  );

  UPDATE public.match_sets
  SET home_score = v_home_score, away_score = v_away_score
  WHERE id = v_set_id;

  IF (v_is_home AND v_home_score >= v_target_points AND (NOT COALESCE(v_win_by_two, true) OR (v_home_score - v_away_score) >= 2)) THEN
    v_set_winner := v_home_team_id;
  ELSIF (NOT v_is_home AND v_away_score >= v_target_points AND (NOT COALESCE(v_win_by_two, true) OR (v_away_score - v_home_score) >= 2)) THEN
    v_set_winner := v_away_team_id;
  END IF;

  IF v_set_winner IS NOT NULL THEN
    UPDATE public.match_sets
    SET status = 'COMPLETED', winner_team_id = v_set_winner, completed_at = now()
    WHERE id = v_set_id;

    SELECT COUNT(*) INTO v_home_sets_won FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_home_team_id;
    SELECT COUNT(*) INTO v_away_sets_won FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_away_team_id;

    IF v_home_sets_won >= COALESCE(v_sets_to_win, 2) THEN
      UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_home_team_id, updated_at = now() WHERE id = p_match_id;
    ELSIF v_away_sets_won >= COALESCE(v_sets_to_win, 2) THEN
      UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_away_team_id, updated_at = now() WHERE id = p_match_id;
    ELSE
      UPDATE public.match_sets
      SET status = 'LIVE', started_at = now()
      WHERE match_id = p_match_id AND set_number = v_set_number + 1 AND status = 'PENDING';
    END IF;
  END IF;

  RETURN jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score, 'set_winner', v_set_winner);
END;
$function$;

-- Backfill: every match records the format it was set up with, and matches that
-- have not started are re-synced with today's rule.
UPDATE public.matches m
SET sets_to_win = r.sets_to_win, win_by_two = r.win_by_two
FROM public.volleyball_rules r
WHERE r.id = public.stage_rule_id(m.tournament_id, m.stage_id);

SELECT public.initialize_match_sets(m.id)
FROM public.matches m
WHERE m.status IN ('SCHEDULED', 'POSTPONED')
  AND public.stage_rule_id(m.tournament_id, m.stage_id) IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.match_sets s WHERE s.match_id = m.id)
  AND NOT EXISTS (SELECT 1 FROM public.score_events e WHERE e.match_id = m.id);

-- Internal: only the definer functions above set up sets.
REVOKE ALL ON FUNCTION public.initialize_match_sets(uuid) FROM PUBLIC, anon, authenticated;
