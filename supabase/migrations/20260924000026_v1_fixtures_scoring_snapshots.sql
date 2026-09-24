-- V1 local-only forward migration after the production-locked Migration 25.
-- Adds fixture generation and trusted scorer/public match snapshot boundaries.

CREATE OR REPLACE FUNCTION public.assign_match_scorer(p_match_id uuid, p_scorer_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_tournament_id IS NULL OR NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_members
    WHERE tournament_id = v_tournament_id AND user_id = p_scorer_user_id
      AND role = 'SCORER' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Scorer is not active for this tournament';
  END IF;
  INSERT INTO public.match_scorers(match_id, user_id, assigned_by)
  VALUES (p_match_id, p_scorer_user_id, v_actor)
  ON CONFLICT (match_id, user_id) DO UPDATE SET assigned_by = EXCLUDED.assigned_by, assigned_at = now();
  RETURN jsonb_build_object('match_id', p_match_id, 'scorer_user_id', p_scorer_user_id, 'assigned', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_stage_fixtures(p_stage_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_stage public.tournament_stages%ROWTYPE;
  v_match_id uuid;
  v_created integer := 0;
  v_existing integer := 0;
  v_rules public.volleyball_rules%ROWTYPE;
  v_rule record;
  v_home record;
  v_away record;
BEGIN
  SELECT * INTO v_stage FROM public.tournament_stages WHERE id = p_stage_id FOR UPDATE;
  IF v_stage.id IS NULL OR NOT public.is_tournament_organizer(v_stage.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_stage.stage_type <> 'LEAGUE' THEN RAISE EXCEPTION 'Only league fixture generation is supported by this V1 operation'; END IF;
  SELECT * INTO v_rules FROM public.volleyball_rules WHERE tournament_id = v_stage.tournament_id AND stage_id = p_stage_id;
  IF v_rules.id IS NULL THEN
    SELECT * INTO v_rules FROM public.volleyball_rules WHERE tournament_id = v_stage.tournament_id AND stage_id IS NULL LIMIT 1;
  END IF;
  IF v_rules.id IS NULL THEN RAISE EXCEPTION 'Volleyball rules are required before fixture generation'; END IF;

  SELECT count(*) INTO v_existing FROM public.matches WHERE stage_id = p_stage_id;
  FOR v_home IN SELECT id FROM public.teams WHERE tournament_id = v_stage.tournament_id AND status = 'ACTIVE' ORDER BY id LOOP
    FOR v_away IN SELECT id FROM public.teams WHERE tournament_id = v_stage.tournament_id AND status = 'ACTIVE' AND id > v_home.id ORDER BY id LOOP
      IF EXISTS (
        SELECT 1 FROM public.matches
        WHERE stage_id = p_stage_id AND home_team_id = v_home.id AND away_team_id = v_away.id
      ) THEN CONTINUE; END IF;
      INSERT INTO public.matches(tournament_id, stage_id, match_number, home_team_id, away_team_id, status)
      VALUES (v_stage.tournament_id, p_stage_id, (SELECT COALESCE(max(match_number), 0) + 1 FROM public.matches WHERE stage_id = p_stage_id), v_home.id, v_away.id, 'SCHEDULED')
      RETURNING id INTO v_match_id;
      v_created := v_created + 1;
      FOR v_rule IN SELECT COALESCE(target_points, 25) AS target_points, set_number FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rules.id ORDER BY set_number LOOP
        INSERT INTO public.match_sets(match_id, set_number, target_points) VALUES (v_match_id, v_rule.set_number, v_rule.target_points);
      END LOOP;
      IF NOT FOUND THEN
        INSERT INTO public.match_sets(match_id, set_number, target_points) VALUES (v_match_id, 1, 25), (v_match_id, 2, 25), (v_match_id, 3, 15);
      END IF;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('stage_id', p_stage_id, 'created', v_created, 'existing', v_existing, 'idempotent', v_created = 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_scorer_match_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_tournament_id uuid; v_state jsonb;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM public.matches WHERE id = p_match_id;
  IF v_tournament_id IS NULL OR NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT jsonb_build_object(
    'match', jsonb_build_object('id', m.id, 'tournament_id', m.tournament_id, 'stage_id', m.stage_id, 'status', m.status, 'match_number', m.match_number, 'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court),
    'home_team', jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name),
    'away_team', jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name),
    'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ms.id, 'set_number', ms.set_number, 'target_points', ms.target_points, 'home_score', ms.home_score, 'away_score', ms.away_score, 'status', ms.status, 'winner_team_id', ms.winner_team_id) ORDER BY ms.set_number) FROM public.match_sets ms WHERE ms.match_id = m.id), '[]'::jsonb)
  ) INTO v_state
  FROM public.matches m JOIN public.teams ht ON ht.id = m.home_team_id JOIN public.teams at ON at.id = m.away_team_id WHERE m.id = p_match_id;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_match_state(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_state jsonb;
BEGIN
  SELECT jsonb_build_object(
    'match', jsonb_build_object('id', m.id, 'tournament_id', m.tournament_id, 'stage_id', m.stage_id, 'status', m.status, 'match_number', m.match_number, 'scheduled_at', m.scheduled_at, 'venue', m.venue, 'court', m.court, 'winner_team_id', m.winner_team_id),
    'home_team', jsonb_build_object('id', ht.id, 'name', ht.name, 'short_name', ht.short_name),
    'away_team', jsonb_build_object('id', at.id, 'name', at.name, 'short_name', at.short_name),
    'sets', COALESCE((SELECT jsonb_agg(jsonb_build_object('set_number', ms.set_number, 'target_points', ms.target_points, 'home_score', ms.home_score, 'away_score', ms.away_score, 'status', ms.status, 'winner_team_id', ms.winner_team_id) ORDER BY ms.set_number) FROM public.match_sets ms WHERE ms.match_id = m.id), '[]'::jsonb)
  ) INTO v_state
  FROM public.matches m JOIN public.tournaments t ON t.id = m.tournament_id JOIN public.teams ht ON ht.id = m.home_team_id JOIN public.teams at ON at.id = m.away_team_id
  WHERE m.id = p_match_id AND (t.is_public OR public.is_tournament_member(m.tournament_id));
  IF v_state IS NULL THEN RAISE EXCEPTION 'Match not available'; END IF;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_stage_standings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_stage_id uuid; v_tournament_id uuid; v_team_id uuid; v_win_points integer; v_loss_points integer;
BEGIN
  IF NEW.status <> 'COMPLETED' OR NEW.winner_team_id IS NULL THEN RETURN NEW; END IF;
  v_stage_id := NEW.stage_id; v_tournament_id := NEW.tournament_id;
  SELECT COALESCE(sr.win_points, 2), COALESCE(sr.loss_points, 0) INTO v_win_points, v_loss_points FROM public.standings_rules sr WHERE sr.stage_id = v_stage_id;
  FOR v_team_id IN SELECT id FROM public.teams WHERE tournament_id = v_tournament_id AND status = 'ACTIVE' LOOP
    INSERT INTO public.standings(tournament_id, stage_id, team_id, played, won, lost, league_points, sets_won, sets_lost, points_for, points_against)
    SELECT v_tournament_id, v_stage_id, v_team_id,
      count(m.id) FILTER (WHERE m.status = 'COMPLETED'),
      count(m.id) FILTER (WHERE m.status = 'COMPLETED' AND m.winner_team_id = v_team_id),
      count(m.id) FILTER (WHERE m.status = 'COMPLETED' AND m.winner_team_id IS NOT NULL AND m.winner_team_id <> v_team_id),
      count(m.id) FILTER (WHERE m.status = 'COMPLETED' AND m.winner_team_id = v_team_id) * v_win_points + count(m.id) FILTER (WHERE m.status = 'COMPLETED' AND m.winner_team_id IS NOT NULL AND m.winner_team_id <> v_team_id) * v_loss_points,
      COALESCE(sum(CASE WHEN m.home_team_id = v_team_id THEN ms.home_sets ELSE ms.away_sets END), 0),
      COALESCE(sum(CASE WHEN m.home_team_id = v_team_id THEN ms.away_sets ELSE ms.home_sets END), 0),
      COALESCE(sum(CASE WHEN m.home_team_id = v_team_id THEN ms.home_points ELSE ms.away_points END), 0),
      COALESCE(sum(CASE WHEN m.home_team_id = v_team_id THEN ms.away_points ELSE ms.home_points END), 0)
    FROM public.matches m
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE s.winner_team_id = m.home_team_id) AS home_sets,
             count(*) FILTER (WHERE s.winner_team_id = m.away_team_id) AS away_sets,
             COALESCE(sum(s.home_score), 0) AS home_points,
             COALESCE(sum(s.away_score), 0) AS away_points
      FROM public.match_sets s WHERE s.match_id = m.id
    ) ms ON true
    WHERE m.stage_id = v_stage_id AND (m.home_team_id = v_team_id OR m.away_team_id = v_team_id)
    ON CONFLICT (stage_id, team_id) DO UPDATE SET played = EXCLUDED.played, won = EXCLUDED.won, lost = EXCLUDED.lost, league_points = EXCLUDED.league_points, sets_won = EXCLUDED.sets_won, sets_lost = EXCLUDED.sets_lost, points_for = EXCLUDED.points_for, points_against = EXCLUDED.points_against, updated_at = now();
  END LOOP;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'refresh_stage_standings_after_match') THEN
    CREATE TRIGGER refresh_stage_standings_after_match AFTER UPDATE OF status, winner_team_id ON public.matches FOR EACH ROW EXECUTE FUNCTION public.refresh_stage_standings();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_public_standings(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament_id AND is_public) THEN RAISE EXCEPTION 'Tournament not available'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('stage_id', s.stage_id, 'team_id', s.team_id, 'team_name', t.name, 'played', s.played, 'won', s.won, 'lost', s.lost, 'league_points', s.league_points, 'sets_won', s.sets_won, 'sets_lost', s.sets_lost, 'points_for', s.points_for, 'points_against', s.points_against) ORDER BY s.league_points DESC, s.sets_won DESC, s.points_for DESC, t.name), '[]'::jsonb) INTO v_result
  FROM public.standings s JOIN public.teams t ON t.id = s.team_id WHERE s.tournament_id = p_tournament_id;
  RETURN v_result;
END;
$$;

-- Compatibility correction for the locked score idempotency function: retries
-- must return the active set's score, not the highest-numbered pending set.
CREATE OR REPLACE FUNCTION public.award_point(p_match_id uuid, p_team_id uuid, p_idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tournament_id uuid; v_stage_id uuid; v_match_status text; v_home_team_id uuid; v_away_team_id uuid;
  v_set_id uuid; v_set_number integer; v_home_score integer; v_away_score integer; v_target_points integer;
  v_rule_id uuid; v_win_by_two boolean; v_sets_to_win integer; v_sequence bigint; v_is_home boolean;
  v_set_winner uuid; v_existing_result jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR trim(p_idempotency_key) = '' THEN RAISE EXCEPTION 'Idempotency key is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.score_events WHERE match_id = p_match_id AND idempotency_key = p_idempotency_key) THEN
    SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id) INTO v_existing_result
    FROM public.match_sets WHERE match_id = p_match_id
    ORDER BY CASE WHEN status IN ('PENDING','LIVE') THEN 0 ELSE 1 END, CASE WHEN status IN ('PENDING','LIVE') THEN set_number ELSE -set_number END LIMIT 1;
    RETURN v_existing_result;
  END IF;
  SELECT tournament_id, stage_id, status, home_team_id, away_team_id INTO v_tournament_id, v_stage_id, v_match_status, v_home_team_id, v_away_team_id FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT (public.is_assigned_scorer(p_match_id) OR public.is_tournament_organizer(v_tournament_id)) THEN RAISE EXCEPTION 'Unauthorized to score this match'; END IF;
  IF v_match_status <> 'LIVE' THEN
    IF v_match_status = 'SCHEDULED' THEN UPDATE public.matches SET status = 'LIVE' WHERE id = p_match_id;
    ELSE RAISE EXCEPTION 'Match is not LIVE or SCHEDULED'; END IF;
  END IF;
  IF p_team_id = v_home_team_id THEN v_is_home := true; ELSIF p_team_id = v_away_team_id THEN v_is_home := false; ELSE RAISE EXCEPTION 'Team is not part of this match'; END IF;
  SELECT id, set_number, home_score, away_score, target_points INTO v_set_id, v_set_number, v_home_score, v_away_score, v_target_points FROM public.match_sets WHERE match_id = p_match_id AND status IN ('PENDING','LIVE') ORDER BY set_number ASC LIMIT 1 FOR UPDATE;
  IF v_set_id IS NULL THEN RAISE EXCEPTION 'No active set found'; END IF;
  UPDATE public.match_sets SET status = 'LIVE', started_at = COALESCE(started_at, now()) WHERE id = v_set_id;
  SELECT id, sets_to_win, win_by_two INTO v_rule_id, v_sets_to_win, v_win_by_two FROM public.volleyball_rules WHERE tournament_id = v_tournament_id AND (stage_id = v_stage_id OR stage_id IS NULL) ORDER BY stage_id NULLS LAST LIMIT 1;
  SELECT COALESCE((SELECT target_points FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule_id AND set_number = v_set_number), v_target_points) INTO v_target_points;
  IF v_is_home THEN v_home_score := v_home_score + 1; ELSE v_away_score := v_away_score + 1; END IF;
  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO v_sequence FROM public.score_events WHERE match_id = p_match_id;
  INSERT INTO public.score_events(match_id, match_set_id, sequence_number, event_type, team_id, home_score_after, away_score_after, idempotency_key, created_by) VALUES (p_match_id, v_set_id, v_sequence, 'POINT', p_team_id, v_home_score, v_away_score, p_idempotency_key, auth.uid());
  UPDATE public.match_sets SET home_score = v_home_score, away_score = v_away_score WHERE id = v_set_id;
  IF (v_is_home AND v_home_score >= v_target_points AND (NOT v_win_by_two OR v_home_score - v_away_score >= 2)) THEN v_set_winner := v_home_team_id;
  ELSIF (NOT v_is_home AND v_away_score >= v_target_points AND (NOT v_win_by_two OR v_away_score - v_home_score >= 2)) THEN v_set_winner := v_away_team_id; END IF;
  IF v_set_winner IS NOT NULL THEN
    UPDATE public.match_sets SET status = 'COMPLETED', winner_team_id = v_set_winner, completed_at = now() WHERE id = v_set_id;
    IF (SELECT count(*) FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_home_team_id) >= v_sets_to_win THEN UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_home_team_id, updated_at = now() WHERE id = p_match_id;
    ELSIF (SELECT count(*) FROM public.match_sets WHERE match_id = p_match_id AND winner_team_id = v_away_team_id) >= v_sets_to_win THEN UPDATE public.matches SET status = 'COMPLETED', winner_team_id = v_away_team_id, updated_at = now() WHERE id = p_match_id; END IF;
  END IF;
  RETURN jsonb_build_object('home_score', v_home_score, 'away_score', v_away_score, 'set_winner', v_set_winner);
EXCEPTION WHEN unique_violation THEN
  IF SQLERRM LIKE '%score_events_match_id_idempotency_key_key%' THEN
    SELECT jsonb_build_object('home_score', home_score, 'away_score', away_score, 'set_winner', winner_team_id) INTO v_existing_result FROM public.match_sets WHERE match_id = p_match_id ORDER BY CASE WHEN status IN ('PENDING','LIVE') THEN 0 ELSE 1 END, CASE WHEN status IN ('PENDING','LIVE') THEN set_number ELSE -set_number END LIMIT 1;
    RETURN v_existing_result;
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_match_scorer(uuid, uuid), public.generate_stage_fixtures(uuid), public.get_scorer_match_state(uuid), public.get_public_match_state(uuid), public.get_public_standings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_match_scorer(uuid, uuid), public.generate_stage_fixtures(uuid), public.get_scorer_match_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_match_state(uuid), public.get_public_standings(uuid) TO anon, authenticated;