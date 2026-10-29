-- v2: walkover and draw results.
--   WALKOVER: the organizer names the winner; it counts as sets_to_win - 0 with no points scored.
--   DRAW (league only): neither team wins; both get standings_rules.draw_points (default 1).

ALTER TABLE public.matches
  ADD COLUMN result_type text NOT NULL DEFAULT 'PLAYED' CONSTRAINT matches_result_type_check CHECK (result_type IN ('PLAYED', 'WALKOVER', 'DRAW'));
ALTER TABLE public.standings ADD COLUMN drawn integer NOT NULL DEFAULT 0;
ALTER TABLE public.standings_rules ADD COLUMN draw_points integer NOT NULL DEFAULT 1 CONSTRAINT standings_rules_draw_points_check CHECK (draw_points >= 0);

-- Standings: a draw is a completed match without a winner.
CREATE OR REPLACE FUNCTION public.refresh_stage_standings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_team_id uuid; v_win_points integer:=2; v_loss_points integer:=0; v_draw_points integer:=1;
BEGIN
  IF NEW.stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tournament_stages WHERE id=NEW.stage_id AND stage_type='LEAGUE') THEN RETURN NEW; END IF;
  SELECT
    COALESCE((SELECT win_points FROM public.standings_rules WHERE stage_id=NEW.stage_id),2),
    COALESCE((SELECT loss_points FROM public.standings_rules WHERE stage_id=NEW.stage_id),0),
    COALESCE((SELECT draw_points FROM public.standings_rules WHERE stage_id=NEW.stage_id),1)
  INTO v_win_points,v_loss_points,v_draw_points;
  FOR v_team_id IN SELECT id FROM public.teams WHERE tournament_id=NEW.tournament_id AND status='ACTIVE' LOOP
    INSERT INTO public.standings(tournament_id,stage_id,team_id,played,won,lost,drawn,league_points,sets_won,sets_lost,points_for,points_against)
    SELECT NEW.tournament_id,NEW.stage_id,v_team_id,
      count(m.id) FILTER(WHERE m.status='COMPLETED'),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id=v_team_id),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id<>v_team_id),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id IS NULL),
      count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id=v_team_id)*v_win_points
        +count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id<>v_team_id)*v_loss_points
        +count(m.id) FILTER(WHERE m.status='COMPLETED' AND m.winner_team_id IS NULL)*v_draw_points,
      COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.home_sets ELSE x.away_sets END),0),COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.away_sets ELSE x.home_sets END),0),
      COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.home_points ELSE x.away_points END),0),COALESCE(sum(CASE WHEN m.home_team_id=v_team_id THEN x.away_points ELSE x.home_points END),0)
    FROM public.matches m LEFT JOIN LATERAL(SELECT count(*) FILTER(WHERE winner_team_id=m.home_team_id) home_sets,count(*) FILTER(WHERE winner_team_id=m.away_team_id) away_sets,COALESCE(sum(home_score),0) home_points,COALESCE(sum(away_score),0) away_points FROM public.match_sets WHERE match_id=m.id)x ON true
    WHERE m.stage_id=NEW.stage_id AND (m.home_team_id=v_team_id OR m.away_team_id=v_team_id)
    ON CONFLICT(stage_id,team_id) DO UPDATE SET played=EXCLUDED.played,won=EXCLUDED.won,lost=EXCLUDED.lost,drawn=EXCLUDED.drawn,league_points=EXCLUDED.league_points,sets_won=EXCLUDED.sets_won,sets_lost=EXCLUDED.sets_lost,points_for=EXCLUDED.points_for,points_against=EXCLUDED.points_against,updated_at=now();
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Standings read model gains the drawn column.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_stage_standings(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, '''''lost'''', COALESCE(s.lost, 0),', '''''lost'''', COALESCE(s.lost, 0), ''''drawn'''', COALESCE(s.drawn, 0),');
  IF position('drawn' IN v_def) = 0 THEN RAISE EXCEPTION 'get_stage_standings patch did not apply'; END IF;
  EXECUTE v_def;
END $$;

-- A drawn league match still completes its stage; only a missing winner on a played match blocks progression.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.progress_completed_match()'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'OR NEW.winner_team_id IS NULL OR', 'OR (NEW.winner_team_id IS NULL AND NEW.result_type<>''DRAW'') OR');
  IF position('result_type' IN v_def) = 0 THEN RAISE EXCEPTION 'progress_completed_match patch did not apply'; END IF;
  EXECUTE v_def;
END $$;

-- Reopening a match also forgets how it was decided.
CREATE OR REPLACE FUNCTION public.rollback_match_result(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_next record;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.status <> 'COMPLETED' THEN RETURN; END IF;

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
      RAISE EXCEPTION 'The next knockout match has already started, so this result can no longer be changed';
    END IF;
    UPDATE public.matches
    SET home_team_id = CASE WHEN v_next.slot = 'HOME' THEN NULL ELSE home_team_id END,
        away_team_id = CASE WHEN v_next.slot = 'AWAY' THEN NULL ELSE away_team_id END,
        updated_at = now()
    WHERE id = v_next.id;
    DELETE FROM public.match_sets WHERE match_id = v_next.id;
  END LOOP;

  UPDATE public.matches SET status = 'LIVE', winner_team_id = NULL, result_type = 'PLAYED', updated_at = now() WHERE id = p_match_id;
  UPDATE public.tournament_stages SET status = 'ACTIVE' WHERE id = v_match.stage_id AND status = 'COMPLETED';
  UPDATE public.tournaments SET status = 'LIVE', updated_at = now() WHERE id = v_match.tournament_id AND status = 'COMPLETED';
END;
$$;
REVOKE ALL ON FUNCTION public.rollback_match_result(uuid) FROM PUBLIC, anon, authenticated;

-- reset_match must also clear result_type when a walkover/draw is reset to be replayed.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.reset_match(uuid,text)'::regprocedure) INTO v_def;
  v_def := replace(v_def, 'status = ''SCHEDULED'', winner_team_id = NULL, updated_at', 'status = ''SCHEDULED'', winner_team_id = NULL, result_type = ''PLAYED'', updated_at');
  IF position('result_type' IN v_def) = 0 THEN RAISE EXCEPTION 'reset_match patch did not apply'; END IF;
  EXECUTE v_def;
END $$;

-- Draw points are part of the points-table rules.
CREATE OR REPLACE FUNCTION public.save_standings_rules(p_stage_id uuid, p_win_points integer, p_loss_points integer, p_tie_break_rules jsonb, p_draw_points integer DEFAULT 1)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_tournament uuid; v_rule text;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.tournament_stages WHERE id=p_stage_id AND stage_type='LEAGUE';
  IF v_tournament IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_win_points<0 OR p_loss_points<0 OR p_draw_points<0 OR p_win_points<p_loss_points THEN RAISE EXCEPTION 'Invalid standings points'; END IF;
  IF jsonb_typeof(p_tie_break_rules)<>'array' OR jsonb_array_length(p_tie_break_rules)=0 THEN RAISE EXCEPTION 'At least one tie-break rule is required'; END IF;
  FOR v_rule IN SELECT jsonb_array_elements_text(p_tie_break_rules) LOOP
    IF v_rule NOT IN ('WINS','SET_DIFFERENCE','SET_RATIO','POINT_DIFFERENCE','POINT_RATIO','NAME') THEN RAISE EXCEPTION 'Unsupported tie-break rule: %',v_rule; END IF;
  END LOOP;
  INSERT INTO public.standings_rules(stage_id,win_points,loss_points,draw_points,tie_break_rules,updated_at) VALUES(p_stage_id,p_win_points,p_loss_points,p_draw_points,p_tie_break_rules,now())
  ON CONFLICT(stage_id) DO UPDATE SET win_points=EXCLUDED.win_points,loss_points=EXCLUDED.loss_points,draw_points=EXCLUDED.draw_points,tie_break_rules=EXCLUDED.tie_break_rules,updated_at=now();
  RETURN jsonb_build_object('stage_id',p_stage_id,'saved',true);
END; $function$;
DROP FUNCTION public.save_standings_rules(uuid, integer, integer, jsonb);
GRANT EXECUTE ON FUNCTION public.save_standings_rules(uuid, integer, integer, jsonb, integer) TO authenticated;

-- Organizer decides a match without playing it (or replaces its result).
CREATE FUNCTION public.declare_match_result(p_match_id uuid, p_result_type text, p_winner_team_id uuid DEFAULT NULL, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_stage_type text;
  v_sets_to_win integer;
  v_first uuid;
  v_org uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_match.id IS NULL OR NOT public.is_tournament_organizer(v_match.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_result_type NOT IN ('WALKOVER', 'DRAW') THEN RAISE EXCEPTION 'Result type must be WALKOVER or DRAW'; END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF v_match.home_team_id IS NULL OR v_match.away_team_id IS NULL THEN RAISE EXCEPTION 'Both teams must be known'; END IF;
  IF v_match.status = 'CANCELLED' THEN RAISE EXCEPTION 'The match is cancelled'; END IF;

  SELECT stage_type INTO v_stage_type FROM public.tournament_stages WHERE id = v_match.stage_id;
  IF p_result_type = 'DRAW' THEN
    IF v_stage_type IS DISTINCT FROM 'LEAGUE' THEN RAISE EXCEPTION 'Only league matches can be drawn'; END IF;
    IF p_winner_team_id IS NOT NULL THEN RAISE EXCEPTION 'A draw has no winner'; END IF;
  ELSIF p_winner_team_id IS DISTINCT FROM v_match.home_team_id AND p_winner_team_id IS DISTINCT FROM v_match.away_team_id THEN
    RAISE EXCEPTION 'The winner must be one of the two teams';
  END IF;

  IF v_match.status = 'COMPLETED' THEN
    PERFORM public.rollback_match_result(p_match_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.match_sets WHERE match_id = p_match_id) THEN
    PERFORM public.initialize_match_sets(p_match_id);
  END IF;
  SELECT COALESCE(sets_to_win, 2) INTO v_sets_to_win FROM public.matches WHERE id = p_match_id;
  SELECT id INTO v_first FROM public.match_sets WHERE match_id = p_match_id ORDER BY set_number LIMIT 1;

  IF v_first IS NOT NULL THEN
    INSERT INTO public.score_events (match_id, match_set_id, sequence_number, event_type, home_score_after, away_score_after, created_by)
    SELECT p_match_id, v_first, COALESCE(max(sequence_number), 0) + 1, 'CORRECTION', 0, 0, auth.uid()
    FROM public.score_events WHERE match_id = p_match_id;
  END IF;
  DELETE FROM public.match_timeouts WHERE match_id = p_match_id;
  UPDATE public.match_sets
  SET home_score = 0, away_score = 0, started_at = NULL, completed_at = NULL,
      status = CASE WHEN p_result_type = 'WALKOVER' AND set_number <= v_sets_to_win THEN 'COMPLETED' ELSE 'PENDING' END,
      winner_team_id = CASE WHEN p_result_type = 'WALKOVER' AND set_number <= v_sets_to_win THEN p_winner_team_id END
  WHERE match_id = p_match_id;

  UPDATE public.matches
  SET status = 'COMPLETED', winner_team_id = p_winner_team_id, result_type = p_result_type, updated_at = now()
  WHERE id = p_match_id;

  SELECT organization_id INTO v_org FROM public.tournaments WHERE id = v_match.tournament_id;
  INSERT INTO public.audit_logs (organization_id, tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason)
  VALUES (v_org, v_match.tournament_id, auth.uid(), 'MATCH_RESULT_DECLARED', 'MATCH', p_match_id,
          jsonb_build_object('status', v_match.status, 'result_type', v_match.result_type),
          jsonb_build_object('result_type', p_result_type, 'winner_team_id', p_winner_team_id), btrim(p_reason));

  RETURN jsonb_build_object('match_id', p_match_id, 'result_type', p_result_type, 'winner_team_id', p_winner_team_id);
END;
$$;
REVOKE ALL ON FUNCTION public.declare_match_result(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_match_result(uuid, text, uuid, text) TO authenticated;

-- Public results can label walkovers and draws.
CREATE OR REPLACE VIEW public.public_fixture_view WITH (security_invoker = true) AS
SELECT m.id, m.tournament_id, m.stage_id, m.match_number, m.home_team_id, m.away_team_id, m.scheduled_at, m.venue, m.court,
  m.status, m.winner_team_id,
  (SELECT sum(match_sets.home_score) FROM public.match_sets WHERE match_sets.match_id = m.id) AS total_home_score,
  (SELECT sum(match_sets.away_score) FROM public.match_sets WHERE match_sets.match_id = m.id) AS total_away_score,
  (SELECT count(*) FROM public.match_sets WHERE match_sets.match_id = m.id AND match_sets.winner_team_id = m.home_team_id) AS home_sets_won,
  (SELECT count(*) FROM public.match_sets WHERE match_sets.match_id = m.id AND match_sets.winner_team_id = m.away_team_id) AS away_sets_won,
  m.round_number, m.bracket_position, m.program_order, m.bracket_match_type, m.result_type
FROM public.matches m
JOIN public.tournaments tourn ON tourn.id = m.tournament_id
WHERE tourn.is_public = true;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.get_public_standings(uuid)'::regprocedure) INTO v_def;
  v_def := replace(v_def, '''lost'', s.lost,', '''lost'', s.lost, ''drawn'', s.drawn,');
  IF position('drawn' IN v_def) = 0 THEN RAISE EXCEPTION 'get_public_standings patch did not apply'; END IF;
  EXECUTE v_def;
END $$;
