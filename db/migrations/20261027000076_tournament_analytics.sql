-- v2: organizer analytics. One read-only function that summarises a tournament: how registrations came in,
-- how many were approved, how matches went (walkovers, draws, how long they took), and how well check-in worked.

CREATE FUNCTION public.get_tournament_analytics(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tz text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE((SELECT timezone FROM public.tournament_settings WHERE tournament_id = p_tournament_id), 'Asia/Kolkata') INTO v_tz;
  RETURN jsonb_build_object(
    'players', (SELECT jsonb_build_object('total', count(*), 'approved', count(*) FILTER (WHERE status = 'APPROVED'),
        'pending', count(*) FILTER (WHERE status IN ('PENDING', 'CHANGES_REQUESTED')), 'rejected', count(*) FILTER (WHERE status = 'REJECTED'),
        'withdrawn', count(*) FILTER (WHERE status = 'WITHDRAWN'))
      FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id),
    'teams', (SELECT jsonb_build_object('applications', count(*), 'approved', count(*) FILTER (WHERE status = 'APPROVED'),
        'pending', count(*) FILTER (WHERE status IN ('PENDING', 'CHANGES_REQUESTED')), 'rejected', count(*) FILTER (WHERE status = 'REJECTED'))
      FROM public.team_owner_applications WHERE tournament_id = p_tournament_id),
    'registrations_per_day', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d, 'players', p, 'teams', t) ORDER BY d) FROM (
        SELECT day AS d, sum(players)::int AS p, sum(teams)::int AS t FROM (
          SELECT (created_at AT TIME ZONE v_tz)::date AS day, 1 AS players, 0 AS teams FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id
          UNION ALL
          SELECT (created_at AT TIME ZONE v_tz)::date, 0, 1 FROM public.team_owner_applications WHERE tournament_id = p_tournament_id) x GROUP BY day) y), '[]'::jsonb),
    'matches', (SELECT jsonb_build_object('total', count(*), 'completed', count(*) FILTER (WHERE status = 'COMPLETED'),
        'walkovers', count(*) FILTER (WHERE status = 'COMPLETED' AND result_type = 'WALKOVER'),
        'draws', count(*) FILTER (WHERE status = 'COMPLETED' AND result_type = 'DRAW'),
        'postponed', count(*) FILTER (WHERE status = 'POSTPONED'), 'cancelled', count(*) FILTER (WHERE status = 'CANCELLED'),
        'live', count(*) FILTER (WHERE status = 'LIVE'))
      FROM public.matches WHERE tournament_id = p_tournament_id),
    'durations', (SELECT jsonb_build_object('played', count(*), 'average_minutes', round(avg(m)::numeric, 1), 'shortest_minutes', round(min(m)::numeric, 1), 'longest_minutes', round(max(m)::numeric, 1)) FROM (
        SELECT extract(epoch FROM (max(ms.completed_at) - min(ms.started_at))) / 60 AS m
        FROM public.match_sets ms JOIN public.matches mt ON mt.id = ms.match_id
        WHERE mt.tournament_id = p_tournament_id AND mt.status = 'COMPLETED' AND mt.result_type = 'PLAYED' AND ms.started_at IS NOT NULL AND ms.completed_at IS NOT NULL
        GROUP BY ms.match_id) d WHERE m > 0),
    'sets', (SELECT jsonb_build_object('played', count(*), 'average_points', round(avg(ms.home_score + ms.away_score)::numeric, 1))
      FROM public.match_sets ms JOIN public.matches mt ON mt.id = ms.match_id WHERE mt.tournament_id = p_tournament_id AND ms.status = 'COMPLETED'),
    'checkins', (SELECT jsonb_build_object('matches', count(*), 'both_teams', count(*) FILTER (WHERE n = 2)) FROM (
        SELECT c.match_id, count(*) AS n FROM public.match_checkins c JOIN public.matches mt ON mt.id = c.match_id WHERE mt.tournament_id = p_tournament_id GROUP BY c.match_id) k),
    'busiest_courts', COALESCE((SELECT jsonb_agg(jsonb_build_object('court', court, 'matches', n) ORDER BY n DESC) FROM (
        SELECT court, count(*) AS n FROM public.matches WHERE tournament_id = p_tournament_id AND court IS NOT NULL AND court <> '' GROUP BY court ORDER BY n DESC LIMIT 6) c), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_tournament_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tournament_analytics(uuid) TO authenticated;
