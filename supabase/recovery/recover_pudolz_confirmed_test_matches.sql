-- One-off fail-closed cleanup for the two confirmed PUDOLZ test matches.
-- DO NOT RUN without explicit approval after the read-only checkpoint.
BEGIN;

DO $recovery$
DECLARE
  v_match_1 constant uuid := '3f3348d6-87ff-41ee-a829-3c988c1dc80b';
  v_match_3 constant uuid := '3881f931-dbb3-42cb-a58e-18c03ba1a71c';
  v_tournament constant uuid := '9944f7b3-54cc-40ec-939c-067d383b4019';
  v_test_scorer constant uuid := 'd04af289-cb37-4d3a-93fc-a3776251e2a0';
  v_match_1_creator uuid;
  v_org_id uuid;
  v_rows integer;
  v_before_1 jsonb;
  v_before_3 jsonb;
  v_after_1 jsonb;
  v_after_3 jsonb;
BEGIN
  -- Use M35's match-scoped serialization domain. Acquire in UUID order.
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || id::text))
  FROM unnest(ARRAY[v_match_1, v_match_3]) AS ids(id)
  ORDER BY id;

  -- Lock both authoritative match rows before inspecting either event stream.
  PERFORM 1
  FROM public.matches
  WHERE id = ANY (ARRAY[v_match_1, v_match_3])
  ORDER BY id
  FOR UPDATE;

  IF (SELECT count(*) FROM public.matches WHERE id = ANY (ARRAY[v_match_1, v_match_3])) <> 2 THEN
    RAISE EXCEPTION 'Recovery guard failed: both exact target matches must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = v_tournament
      AND name = 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8'
  ) THEN
    RAISE EXCEPTION 'Recovery guard failed: exact PUDOLZ tournament identity differs';
  END IF;

  IF (SELECT count(*) FROM public.matches
      WHERE id = ANY (ARRAY[v_match_1, v_match_3])
        AND tournament_id = v_tournament
        AND status = 'LIVE'
        AND winner_team_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Recovery guard failed: both matches must be LIVE with NULL winners in PUDOLZ';
  END IF;

  -- Both matches must have only the three exact uncompleted, winnerless sets.
  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])) <> 6 THEN
    RAISE EXCEPTION 'Recovery guard failed: expected exactly three sets per target match';
  END IF;

  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])
        AND set_number = 1 AND status = 'LIVE'
        AND home_score = 0 AND away_score = 0
        AND winner_team_id IS NULL AND completed_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Recovery guard failed: Set 1 state differs';
  END IF;

  IF (SELECT count(*) FROM public.match_sets
      WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])
        AND set_number IN (2, 3) AND status = 'PENDING'
        AND home_score = 0 AND away_score = 0
        AND winner_team_id IS NULL AND started_at IS NULL AND completed_at IS NULL) <> 4 THEN
    RAISE EXCEPTION 'Recovery guard failed: Set 2 or Set 3 state differs';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_sets
    WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])
      AND (status = 'COMPLETED' OR winner_team_id IS NOT NULL OR completed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Recovery guard failed: completed or winner-bearing set exists';
  END IF;

  IF (SELECT count(*) FROM public.match_timeouts
      WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])) <> 0 THEN
    RAISE EXCEPTION 'Recovery guard failed: target matches must have zero timeouts';
  END IF;

  IF (SELECT count(*) FROM public.score_events WHERE match_id = v_match_1) <> 4 THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 1 must have exactly four events';
  END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(
        se.sequence_number, se.event_type, ms.set_number,
        se.home_score_after, se.away_score_after) ORDER BY se.sequence_number)
      FROM public.score_events se
      JOIN public.match_sets ms ON ms.id = se.match_set_id
      WHERE se.match_id = v_match_1) <>
     '[[1,"POINT",1,1,0],[2,"POINT",1,1,1],[3,"UNDO",1,1,0],[4,"UNDO",1,0,0]]'::jsonb THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 1 event stream differs';
  END IF;

  IF (SELECT count(DISTINCT created_by) FROM public.score_events WHERE match_id = v_match_1) <> 1 THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 1 event creator is not consistent';
  END IF;

  SELECT min(created_by::text)::uuid INTO v_match_1_creator
  FROM public.score_events WHERE match_id = v_match_1;

  IF v_match_1_creator IS DISTINCT FROM v_test_scorer THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 1 event creator differs';
  END IF;

  IF (SELECT count(*) FROM public.score_events WHERE match_id = v_match_3) <> 2 THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 3 must have exactly two events';
  END IF;

  IF (SELECT jsonb_agg(jsonb_build_array(
        se.sequence_number, se.event_type, ms.set_number,
        se.home_score_after, se.away_score_after, se.created_by) ORDER BY se.sequence_number)
      FROM public.score_events se
      JOIN public.match_sets ms ON ms.id = se.match_set_id
      WHERE se.match_id = v_match_3) <>
     jsonb_build_array(
       jsonb_build_array(1, 'POINT', 1, 1, 0, v_test_scorer),
       jsonb_build_array(2, 'UNDO', 1, 0, 0, v_test_scorer)
     ) THEN
    RAISE EXCEPTION 'Recovery guard failed: Match 3 event stream or creator differs';
  END IF;

  IF (SELECT count(*) FROM public.audit_logs
      WHERE entity_id = ANY (ARRAY[v_match_1, v_match_3])
        AND action = 'SCORING_TEST_MATCH_RECOVERED') <> 0 THEN
    RAISE EXCEPTION 'Recovery guard failed: a target already has a recovery audit';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.tournaments WHERE id = v_tournament;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id,
      'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'sets', (SELECT jsonb_agg(to_jsonb(ms) - 'match_id' ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_events', (SELECT jsonb_agg(to_jsonb(se) - 'match_id' ORDER BY se.sequence_number)
      FROM public.score_events se WHERE se.match_id = m.id),
    'timeout_count', (SELECT count(*) FROM public.match_timeouts mt WHERE mt.match_id = m.id)
  ) INTO v_before_1 FROM public.matches m WHERE m.id = v_match_1;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id,
      'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'sets', (SELECT jsonb_agg(to_jsonb(ms) - 'match_id' ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_events', (SELECT jsonb_agg(to_jsonb(se) - 'match_id' ORDER BY se.sequence_number)
      FROM public.score_events se WHERE se.match_id = m.id),
    'timeout_count', (SELECT count(*) FROM public.match_timeouts mt WHERE mt.match_id = m.id)
  ) INTO v_before_3 FROM public.matches m WHERE m.id = v_match_3;

  -- FIRST DATA MUTATION: every assertion for both matches has passed.
  DELETE FROM public.score_events
  WHERE match_id = ANY (ARRAY[v_match_1, v_match_3]);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 6 THEN
    RAISE EXCEPTION 'Recovery mutation failed: expected to delete six verified events, deleted %', v_rows;
  END IF;

  UPDATE public.match_sets
  SET status = 'PENDING', home_score = 0, away_score = 0,
      winner_team_id = NULL, started_at = NULL, completed_at = NULL
  WHERE match_id = ANY (ARRAY[v_match_1, v_match_3]) AND set_number = 1;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Recovery mutation failed: expected to reset two Set 1 rows, reset %', v_rows;
  END IF;

  UPDATE public.matches
  SET status = 'SCHEDULED', winner_team_id = NULL, updated_at = now()
  WHERE id = ANY (ARRAY[v_match_1, v_match_3]);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN
    RAISE EXCEPTION 'Recovery mutation failed: expected to reset two matches, reset %', v_rows;
  END IF;

  IF (SELECT count(*) FROM public.score_events
      WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])) <> 0
     OR (SELECT count(*) FROM public.match_timeouts
         WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])) <> 0
     OR (SELECT count(*) FROM public.matches
         WHERE id = ANY (ARRAY[v_match_1, v_match_3])
           AND status = 'SCHEDULED' AND winner_team_id IS NULL) <> 2
     OR (SELECT count(*) FROM public.match_sets
         WHERE match_id = ANY (ARRAY[v_match_1, v_match_3])
           AND status = 'PENDING' AND home_score = 0 AND away_score = 0
           AND winner_team_id IS NULL AND started_at IS NULL AND completed_at IS NULL) <> 6 THEN
    RAISE EXCEPTION 'Recovery postcondition failed';
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id,
      'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'sets', (SELECT jsonb_agg(to_jsonb(ms) - 'match_id' ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_event_count', (SELECT count(*) FROM public.score_events se WHERE se.match_id = m.id),
    'timeout_count', (SELECT count(*) FROM public.match_timeouts mt WHERE mt.match_id = m.id),
    'recovered_at', clock_timestamp()
  ) INTO v_after_1 FROM public.matches m WHERE m.id = v_match_1;

  SELECT jsonb_build_object(
    'match', jsonb_build_object('status', m.status, 'winner_team_id', m.winner_team_id,
      'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'sets', (SELECT jsonb_agg(to_jsonb(ms) - 'match_id' ORDER BY ms.set_number)
      FROM public.match_sets ms WHERE ms.match_id = m.id),
    'score_event_count', (SELECT count(*) FROM public.score_events se WHERE se.match_id = m.id),
    'timeout_count', (SELECT count(*) FROM public.match_timeouts mt WHERE mt.match_id = m.id),
    'recovered_at', clock_timestamp()
  ) INTO v_after_3 FROM public.matches m WHERE m.id = v_match_3;

  INSERT INTO public.audit_logs(
    organization_id, tournament_id, user_id, action, entity_type, entity_id,
    before_json, after_json, reason
  ) VALUES
    (v_org_id, v_tournament, auth.uid(), 'SCORING_TEST_MATCH_RECOVERED', 'matches', v_match_1,
      v_before_1, v_after_1,
      'Removed confirmed test scoring history and restored the unstarted fixture to SCHEDULED'),
    (v_org_id, v_tournament, auth.uid(), 'SCORING_TEST_MATCH_RECOVERED', 'matches', v_match_3,
      v_before_3, v_after_3,
      'Removed confirmed test scoring history and restored the unstarted fixture to SCHEDULED');
END
$recovery$;

COMMIT;
