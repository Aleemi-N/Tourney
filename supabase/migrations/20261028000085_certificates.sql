-- v2: certificates. Nothing is stored: a certificate is worked out from what the tournament already knows.
--  * CHAMPION / RUNNER_UP: the players of the winning and losing finalist (the last stage's final, or the top two of its league table).
--  * AWARD: each tournament award the organizer gave.   * MVP: each player of the match.   * PARTICIPANT: every approved player.
-- Public once the tournament is completed (names are already public on its pages); organizers can preview them any time.

CREATE FUNCTION public.get_certificates(p_tournament_id uuid)
RETURNS TABLE (cert_key text, kind text, title text, recipient text, player_id uuid, team_name text, detail text, awarded_on date, tournament_name text, tournament_slug text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  t record;
  v_stage uuid;
  v_type text;
  v_champion uuid;
  v_runner uuid;
BEGIN
  SELECT tt.id, tt.name, tt.slug, tt.status, tt.is_public, tt.end_date INTO t FROM public.tournaments tt WHERE tt.id = p_tournament_id;
  IF t.id IS NULL THEN RETURN; END IF;
  IF NOT (t.is_public AND t.status IN ('COMPLETED', 'ARCHIVED')) AND NOT (auth.uid() IS NOT NULL AND public.is_tournament_organizer(p_tournament_id)) THEN RETURN; END IF;

  SELECT s.id, s.stage_type INTO v_stage, v_type FROM public.tournament_stages s WHERE s.tournament_id = p_tournament_id ORDER BY s.sequence DESC LIMIT 1;
  IF v_stage IS NOT NULL AND v_type = 'KNOCKOUT' THEN
    SELECT m.winner_team_id, CASE WHEN m.winner_team_id = m.home_team_id THEN m.away_team_id ELSE m.home_team_id END INTO v_champion, v_runner
    FROM public.matches m WHERE m.stage_id = v_stage AND m.status = 'COMPLETED' AND m.winner_team_id IS NOT NULL
    ORDER BY (m.bracket_match_type = 'FINAL') DESC NULLS LAST, m.round_number DESC NULLS LAST, m.match_number DESC LIMIT 1;
  ELSIF v_stage IS NOT NULL THEN
    SELECT (array_agg(x.team_id ORDER BY x.rn))[1], (array_agg(x.team_id ORDER BY x.rn))[2] INTO v_champion, v_runner
    FROM (SELECT st.team_id, row_number() OVER (ORDER BY st.league_points DESC, (st.sets_won - st.sets_lost) DESC, (st.points_for - st.points_against) DESC, st.team_id) AS rn
          FROM public.standings st WHERE st.stage_id = v_stage AND st.played > 0) x WHERE x.rn <= 2;
  END IF;
  -- Only when the tournament is over; an organizer's preview of a running one gets no podium.
  IF t.status NOT IN ('COMPLETED', 'ARCHIVED') THEN v_champion := NULL; v_runner := NULL; END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT tp.player_id AS pid, tm.name AS team FROM public.team_players tp JOIN public.teams tm ON tm.id = tp.team_id WHERE tp.tournament_id = p_tournament_id AND tp.status = 'ACTIVE'
  ), rows AS (
    SELECT 'CHAMPION:' || tp.player_id AS k, 'CHAMPION' AS kd, 'Champions' AS ti, pp.display_name AS rec, tp.player_id AS pid, tm.name AS team,
           'Winners of ' || t.name AS det, t.end_date AS d, 1 AS ord
    FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id JOIN public.teams tm ON tm.id = tp.team_id
    WHERE v_champion IS NOT NULL AND tp.team_id = v_champion AND tp.status = 'ACTIVE'
    UNION ALL
    SELECT 'RUNNER_UP:' || tp.player_id, 'RUNNER_UP', 'Runners-up', pp.display_name, tp.player_id, tm.name, 'Finalists of ' || t.name, t.end_date, 2
    FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id JOIN public.teams tm ON tm.id = tp.team_id
    WHERE v_runner IS NOT NULL AND tp.team_id = v_runner AND tp.status = 'ACTIVE'
    UNION ALL
    SELECT 'AWARD:' || a.id, 'AWARD', a.name, pp.display_name, a.player_id, (SELECT r.team FROM roster r WHERE r.pid = a.player_id LIMIT 1), a.note, t.end_date, 3
    FROM public.tournament_awards a JOIN public.player_profiles pp ON pp.id = a.player_id WHERE a.tournament_id = p_tournament_id
    UNION ALL
    SELECT 'MVP:' || ma.match_id, 'MVP', 'Player of the match', pp.display_name, ma.mvp_player_id, (SELECT r.team FROM roster r WHERE r.pid = ma.mvp_player_id LIMIT 1),
           h.name || ' vs ' || w.name, m.scheduled_at::date, 4
    FROM public.match_awards ma JOIN public.matches m ON m.id = ma.match_id JOIN public.player_profiles pp ON pp.id = ma.mvp_player_id
      JOIN public.teams h ON h.id = m.home_team_id JOIN public.teams w ON w.id = m.away_team_id
    WHERE m.tournament_id = p_tournament_id AND m.status = 'COMPLETED'
    UNION ALL
    SELECT 'PARTICIPANT:' || r.player_id, 'PARTICIPANT', 'Certificate of participation', pp.display_name, r.player_id, (SELECT ro.team FROM roster ro WHERE ro.pid = r.player_id LIMIT 1),
           'For taking part in ' || t.name, t.end_date, 5
    FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id WHERE r.tournament_id = p_tournament_id AND r.status = 'APPROVED'
  )
  SELECT rows.k, rows.kd, rows.ti, rows.rec, rows.pid, rows.team, rows.det, rows.d, t.name, t.slug FROM rows ORDER BY rows.ord, rows.rec;
END;
$$;

CREATE FUNCTION public.get_certificate(p_tournament_id uuid, p_key text)
RETURNS TABLE (cert_key text, kind text, title text, recipient text, player_id uuid, team_name text, detail text, awarded_on date, tournament_name text, tournament_slug text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.* FROM public.get_certificates(p_tournament_id) c WHERE c.cert_key = p_key LIMIT 1;
$$;

-- The signed-in player's own certificates from finished public tournaments.
CREATE FUNCTION public.my_certificates()
RETURNS TABLE (tournament_id uuid, cert_key text, kind text, title text, recipient text, team_name text, detail text, awarded_on date, tournament_name text, tournament_slug text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT t.id, c.cert_key, c.kind, c.title, c.recipient, c.team_name, c.detail, c.awarded_on, c.tournament_name, c.tournament_slug
  FROM public.tournaments t CROSS JOIN LATERAL public.get_certificates(t.id) c
  WHERE auth.uid() IS NOT NULL AND t.is_public AND t.status IN ('COMPLETED', 'ARCHIVED')
    AND c.player_id IN (SELECT pp.id FROM public.player_profiles pp WHERE pp.user_id = auth.uid())
  ORDER BY t.end_date DESC NULLS LAST, c.kind;
$$;

REVOKE ALL ON FUNCTION public.get_certificates(uuid), public.get_certificate(uuid, text), public.my_certificates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_certificates(uuid), public.get_certificate(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_certificates() TO authenticated;
