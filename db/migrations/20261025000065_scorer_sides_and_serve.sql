-- v2: scorer court setup. Per set, which team is on the left of the scoreboard and
-- who serves first. Later sets are derived by the app (sides alternate, first serve
-- alternates, the deciding set is a fresh toss), so only explicit choices are stored.

ALTER TABLE public.match_sets
  ADD COLUMN left_team_id uuid REFERENCES public.teams(id),
  ADD COLUMN first_serve_team_id uuid REFERENCES public.teams(id);

-- The team that served the latest point in a set: the winner of the newest point that
-- no later UNDO cancelled; the first server when no point was played; unknown (NULL)
-- once a manual correction made the history stale.
CREATE FUNCTION public.set_serving_team(p_set_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event record;
  v_undone integer := 0;
BEGIN
  FOR v_event IN
    SELECT event_type, team_id FROM public.score_events WHERE match_set_id = p_set_id ORDER BY sequence_number DESC
  LOOP
    IF v_event.event_type = 'CORRECTION' THEN RETURN NULL; END IF;
    IF v_event.event_type = 'UNDO' THEN
      v_undone := v_undone + 1;
    ELSIF v_undone > 0 THEN
      v_undone := v_undone - 1;
    ELSE
      RETURN v_event.team_id;
    END IF;
  END LOOP;
  RETURN (SELECT first_serve_team_id FROM public.match_sets WHERE id = p_set_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_serving_team(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.set_match_setup(p_match_id uuid, p_set_number integer, p_left_team_id uuid, p_first_serve_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_set public.match_sets%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_match.tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to score this match';
  END IF;
  IF v_match.status NOT IN ('SCHEDULED', 'LIVE') THEN RAISE EXCEPTION 'The match is not being played'; END IF;
  IF p_left_team_id NOT IN (v_match.home_team_id, v_match.away_team_id)
     OR p_first_serve_team_id NOT IN (v_match.home_team_id, v_match.away_team_id) THEN
    RAISE EXCEPTION 'Choose one of the two teams';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_set FROM public.match_sets WHERE match_id = p_match_id AND set_number = p_set_number FOR UPDATE;
  IF v_set.id IS NULL THEN RAISE EXCEPTION 'Set not found'; END IF;
  IF v_set.status = 'COMPLETED' THEN RAISE EXCEPTION 'That set is already finished'; END IF;

  UPDATE public.match_sets SET left_team_id = p_left_team_id, first_serve_team_id = p_first_serve_team_id WHERE id = v_set.id;
  RETURN jsonb_build_object('set_number', p_set_number, 'left_team_id', p_left_team_id, 'first_serve_team_id', p_first_serve_team_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_match_setup(uuid, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_match_setup(uuid, integer, uuid, uuid) TO authenticated;

-- A reset match starts from a fresh toss.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.reset_match(uuid,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'SET home_score = 0, away_score = 0, status = ''PENDING'',', 'SET home_score = 0, away_score = 0, left_team_id = NULL, first_serve_team_id = NULL, status = ''PENDING'',');
  IF position('left_team_id' IN v_def) = 0 THEN RAISE EXCEPTION 'reset_match patch did not apply'; END IF;
  EXECUTE v_def;
END $$;

-- Both match state readers expose the court setup and the current server per set.
DO $$
DECLARE v_name text; v_def text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['public.get_scorer_match_state(uuid)', 'public.get_public_match_state(uuid)'] LOOP
    SELECT pg_get_functiondef(v_name::regprocedure) INTO v_def;
    v_def := replace(v_def, '''winner_team_id'', ms.winner_team_id',
      '''winner_team_id'', ms.winner_team_id, ''left_team_id'', ms.left_team_id, ''first_serve_team_id'', ms.first_serve_team_id, ''serving_team_id'', public.set_serving_team(ms.id)');
    IF position('serving_team_id' IN v_def) = 0 THEN RAISE EXCEPTION '% patch did not apply', v_name; END IF;
    EXECUTE v_def;
  END LOOP;
END $$;
