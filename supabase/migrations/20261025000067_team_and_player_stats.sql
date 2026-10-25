-- v2: statistics from existing data. Only completed matches of public tournaments
-- count. A team's stats follow its reusable profile across tournaments; a player's
-- stats are the results of the teams they were on the squad of (per-point player
-- tagging does not exist, so individual points are not attributed).

-- One row per team per completed match, with that team's view of the result.
CREATE FUNCTION public.team_match_results(p_team_ids uuid[])
RETURNS TABLE (
  team_id uuid, tournament_id uuid, match_id uuid, result text,
  sets_for integer, sets_against integer, points_for integer, points_against integer
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT t.id, m.tournament_id, m.id,
    CASE WHEN m.winner_team_id IS NULL THEN 'D' WHEN m.winner_team_id = t.id THEN 'W' ELSE 'L' END,
    COALESCE(CASE WHEN m.home_team_id = t.id THEN x.home_sets ELSE x.away_sets END, 0)::integer,
    COALESCE(CASE WHEN m.home_team_id = t.id THEN x.away_sets ELSE x.home_sets END, 0)::integer,
    COALESCE(CASE WHEN m.home_team_id = t.id THEN x.home_points ELSE x.away_points END, 0)::integer,
    COALESCE(CASE WHEN m.home_team_id = t.id THEN x.away_points ELSE x.home_points END, 0)::integer
  FROM public.teams t
  JOIN public.matches m ON m.status = 'COMPLETED' AND t.id IN (m.home_team_id, m.away_team_id)
  JOIN public.tournaments tourn ON tourn.id = m.tournament_id AND tourn.is_public
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE s.winner_team_id = m.home_team_id) AS home_sets,
           count(*) FILTER (WHERE s.winner_team_id = m.away_team_id) AS away_sets,
           sum(s.home_score) AS home_points, sum(s.away_score) AS away_points
    FROM public.match_sets s WHERE s.match_id = m.id
  ) x ON true
  WHERE t.id = ANY (p_team_ids);
$$;
REVOKE ALL ON FUNCTION public.team_match_results(uuid[]) FROM PUBLIC, anon, authenticated;

-- Totals and a per-tournament breakdown for a set of teams.
CREATE FUNCTION public.summarize_results(p_team_ids uuid[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH r AS (SELECT * FROM public.team_match_results(p_team_ids)),
  per AS (
    SELECT r.tournament_id, t.name, t.slug,
      count(*) AS played, count(*) FILTER (WHERE result = 'W') AS won, count(*) FILTER (WHERE result = 'L') AS lost,
      count(*) FILTER (WHERE result = 'D') AS drawn,
      sum(sets_for) AS sets_for, sum(sets_against) AS sets_against,
      sum(points_for) AS points_for, sum(points_against) AS points_against
    FROM r JOIN public.tournaments t ON t.id = r.tournament_id
    GROUP BY r.tournament_id, t.name, t.slug
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'played', COALESCE(sum(played), 0), 'won', COALESCE(sum(won), 0), 'lost', COALESCE(sum(lost), 0), 'drawn', COALESCE(sum(drawn), 0),
      'sets_for', COALESCE(sum(sets_for), 0), 'sets_against', COALESCE(sum(sets_against), 0),
      'points_for', COALESCE(sum(points_for), 0), 'points_against', COALESCE(sum(points_against), 0),
      'tournaments', count(*)),
    'tournaments', COALESCE(jsonb_agg(jsonb_build_object(
      'tournament_id', tournament_id, 'name', name, 'slug', slug, 'played', played, 'won', won, 'lost', lost, 'drawn', drawn,
      'sets_for', sets_for, 'sets_against', sets_against, 'points_for', points_for, 'points_against', points_against)
      ORDER BY name), '[]'::jsonb))
  FROM per;
$$;
REVOKE ALL ON FUNCTION public.summarize_results(uuid[]) FROM PUBLIC, anon, authenticated;

-- p_team_id is any tournament team; its profile pulls in the same team's other tournaments.
CREATE FUNCTION public.get_team_stats(p_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_ids uuid[];
BEGIN
  SELECT t.* INTO v_team FROM public.teams t JOIN public.tournaments tourn ON tourn.id = t.tournament_id
  WHERE t.id = p_team_id AND (tourn.is_public OR public.is_tournament_member(t.tournament_id));
  IF v_team.id IS NULL THEN RAISE EXCEPTION 'Team not available'; END IF;

  SELECT array_agg(t.id) INTO v_ids
  FROM public.teams t JOIN public.tournaments tourn ON tourn.id = t.tournament_id
  WHERE t.id = v_team.id OR (v_team.team_profile_id IS NOT NULL AND t.team_profile_id = v_team.team_profile_id AND tourn.is_public);

  RETURN jsonb_build_object('team', jsonb_build_object('id', v_team.id, 'name', v_team.name, 'short_name', v_team.short_name,
           'logo_path', v_team.logo_path, 'place', v_team.place, 'primary_color', v_team.primary_color),
         'stats', public.summarize_results(v_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.get_team_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_team_stats(uuid) TO anon, authenticated;

CREATE FUNCTION public.get_player_stats(p_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_player public.player_profiles%ROWTYPE;
  v_ids uuid[];
  v_teams jsonb;
BEGIN
  SELECT * INTO v_player FROM public.player_profiles WHERE id = p_player_id;
  IF v_player.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_players tp JOIN public.tournaments t ON t.id = tp.tournament_id
    WHERE tp.player_id = p_player_id AND tp.status = 'ACTIVE' AND t.is_public
  ) THEN RAISE EXCEPTION 'Player not available'; END IF;

  SELECT array_agg(tp.team_id) INTO v_ids
  FROM public.team_players tp JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.player_id = p_player_id AND tp.status = 'ACTIVE' AND t.is_public;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('team_id', tm.id, 'team_name', tm.name, 'tournament_slug', t.slug, 'tournament_name', t.name)
           ORDER BY t.name), '[]'::jsonb) INTO v_teams
  FROM public.team_players tp JOIN public.teams tm ON tm.id = tp.team_id JOIN public.tournaments t ON t.id = tp.tournament_id
  WHERE tp.player_id = p_player_id AND tp.status = 'ACTIVE' AND t.is_public;

  RETURN jsonb_build_object('player', jsonb_build_object('id', v_player.id, 'display_name', v_player.display_name,
           'photo_path', v_player.photo_path, 'primary_position', v_player.primary_position, 'secondary_position', v_player.secondary_position,
           'height_cm', v_player.height_cm),
         'teams', v_teams,
         'stats', public.summarize_results(v_ids));
END;
$$;
REVOKE ALL ON FUNCTION public.get_player_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_player_stats(uuid) TO anon, authenticated;
