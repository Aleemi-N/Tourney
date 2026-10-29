-- One-off guarded recovery for the approved PUDOLZ scoring-test match only.
-- Do not run until explicitly approved. Safe both before and after M35: when
-- match_timeouts exists, the guard requires this match to have no timeout rows.
BEGIN;

DO $recovery$
DECLARE
  v_match_id constant uuid := '3f3348d6-87ff-41ee-a829-3c988c1dc80b';
  v_match_count integer;
  v_event_count integer;
  v_event_id uuid;
  v_set_count integer;
  v_timeout_count integer;
  v_tournament_id uuid;
  v_organization_id uuid;
  v_previous_state jsonb;
  v_resulting_state jsonb;
BEGIN
  -- Serialize with M35 scoring/timeout RPCs if M35 is already installed.
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || v_match_id::text));

  SELECT count(*)::integer
  INTO v_match_count
  FROM public.matches
  WHERE id = v_match_id;

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: expected exactly one match %, found %',
      v_match_id, v_match_count;
  END IF;

  PERFORM 1 FROM public.matches WHERE id = v_match_id FOR UPDATE;

  SELECT m.tournament_id, t.organization_id
  INTO v_tournament_id, v_organization_id
  FROM public.matches m
  JOIN public.tournaments t ON t.id = m.tournament_id
  WHERE m.id = v_match_id
    AND m.status = 'LIVE'
    AND m.winner_team_id IS NULL;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'Recovery guard failed: match must be LIVE with NULL winner';
  END IF;

  SELECT count(*)::integer
  INTO v_event_count
  FROM public.score_events se
  JOIN public.match_sets ms ON ms.id = se.match_set_id
  WHERE se.match_id = v_match_id
    AND se.sequence_number = 1
    AND se.event_type = 'POINT'
    AND ms.match_id = v_match_id
    AND ms.set_number = 1;

  IF v_event_count <> 1 OR
     (SELECT count(*) FROM public.score_events WHERE match_id = v_match_id) <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: expected exactly one Set 1 POINT event at sequence 1';
  END IF;

  SELECT se.id
  INTO v_event_id
  FROM public.score_events se
  JOIN public.match_sets ms ON ms.id = se.match_set_id
  WHERE se.match_id = v_match_id
    AND se.sequence_number = 1
    AND se.event_type = 'POINT'
    AND ms.match_id = v_match_id
    AND ms.set_number = 1;

  SELECT count(*)::integer
  INTO v_set_count
  FROM public.match_sets
  WHERE match_id = v_match_id;

  IF v_set_count <> 3 THEN
    RAISE EXCEPTION 'Recovery guard failed: expected exactly three match sets, found %', v_set_count;
  END IF;

  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = v_match_id AND set_number = 1 AND status = 'LIVE'
        AND home_score = 1 AND away_score = 0 AND winner_team_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: Set 1 state differs from expected LIVE 1-0';
  END IF;

  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = v_match_id AND set_number = 2 AND status = 'PENDING'
        AND home_score = 0 AND away_score = 0 AND winner_team_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: Set 2 state differs from expected PENDING 0-0';
  END IF;

  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = v_match_id AND set_number = 3 AND status = 'PENDING'
        AND home_score = 0 AND away_score = 0 AND winner_team_id IS NULL) <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: Set 3 state differs from expected PENDING 0-0';
  END IF;

  -- M35 is not required for this recovery. If it is present, explicitly prove
  -- that no timeout history exists before changing scoring state.
  IF to_regclass('public.match_timeouts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::integer FROM public.match_timeouts WHERE match_id = $1'
      INTO v_timeout_count USING v_match_id;
    IF v_timeout_count <> 0 THEN
      RAISE EXCEPTION 'Recovery guard failed: expected zero timeout rows, found %', v_timeout_count;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id),
    'sets', (SELECT jsonb_agg(jsonb_build_object(
      'set_number', ms.set_number, 'status', ms.status,
      'home_score', ms.home_score, 'away_score', ms.away_score,
      'winner_team_id', ms.winner_team_id) ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_events', (SELECT jsonb_agg(jsonb_build_object(
      'id', se.id, 'sequence_number', se.sequence_number,
      'event_type', se.event_type, 'match_set_id', se.match_set_id))
      FROM public.score_events se WHERE se.match_id = m.id)
  )
  INTO v_previous_state
  FROM public.matches m
  WHERE m.id = v_match_id;

  DELETE FROM public.score_events
  WHERE id = v_event_id AND match_id = v_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery mutation failed: verified score event was not deleted';
  END IF;

  UPDATE public.match_sets
  SET home_score = 0,
      away_score = 0,
      status = 'PENDING',
      winner_team_id = NULL,
      started_at = NULL,
      completed_at = NULL
  WHERE match_id = v_match_id AND set_number = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery mutation failed: Set 1 was not reset';
  END IF;

  UPDATE public.matches
  SET status = 'SCHEDULED', winner_team_id = NULL, updated_at = now()
  WHERE id = v_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery mutation failed: match was not reset';
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id),
    'sets', (SELECT jsonb_agg(jsonb_build_object(
      'set_number', ms.set_number, 'status', ms.status,
      'home_score', ms.home_score, 'away_score', ms.away_score,
      'winner_team_id', ms.winner_team_id) ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_event_count', (SELECT count(*) FROM public.score_events se WHERE se.match_id = m.id),
    'recovered_at', clock_timestamp()
  )
  INTO v_resulting_state
  FROM public.matches m
  WHERE m.id = v_match_id;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type, entity_id,
    before_json, after_json, reason
  ) VALUES (
    v_organization_id, v_tournament_id, auth.uid(),
    'SCORING_TEST_MATCH_RECOVERED', 'matches', v_match_id,
    v_previous_state, v_resulting_state,
    'Remove the single verified production scoring-test point and restore the match to its scheduled state'
  );
END
$recovery$;

COMMIT;
