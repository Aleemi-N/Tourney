-- v2: scorer lineups (starting six, libero, substitutions) with rotation, and awards (match MVP, tournament awards).
-- Rotation is derived, not stored: the serving side rotates each time it wins serve back, so the current court
-- order follows from the starting order and the point history. The database checks who is on court and the
-- six-substitutions-per-set limit; the app applies the rotation to show positions and enforce back-row libero swaps.

CREATE TABLE public.match_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number integer NOT NULL CHECK (set_number > 0),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  slots uuid[] NOT NULL CHECK (cardinality(slots) = 6), -- starting order, index 1 = position I (the server)
  libero_id uuid REFERENCES public.player_profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, set_number, team_id)
);

CREATE TABLE public.match_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  set_number integer NOT NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  kind text NOT NULL CHECK (kind IN ('SUB', 'LIBERO_IN', 'LIBERO_OUT')),
  out_player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  in_player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  home_score integer NOT NULL,
  away_score integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_substitutions_match_idx ON public.match_substitutions (match_id, set_number, created_at);

CREATE TABLE public.match_awards (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  mvp_player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tournament_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, name)
);

ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_lineups, public.match_substitutions, public.match_awards, public.tournament_awards FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Helpers
--------------------------------------------------------------------------------
CREATE FUNCTION public.can_run_match(p_match_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_match_id
    AND (public.is_assigned_scorer(m.id) OR public.is_tournament_organizer(m.tournament_id)));
$$;
REVOKE ALL ON FUNCTION public.can_run_match(uuid) FROM PUBLIC, anon, authenticated;

-- Who is on court for a team in a set: starting six with the recorded substitutions applied.
CREATE FUNCTION public.lineup_court(p_match_id uuid, p_set_number integer, p_team_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_court uuid[];
  v_sub record;
BEGIN
  SELECT slots INTO v_court FROM public.match_lineups WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id;
  IF v_court IS NULL THEN RETURN NULL; END IF;
  FOR v_sub IN SELECT out_player_id, in_player_id FROM public.match_substitutions
               WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id ORDER BY created_at, id LOOP
    v_court := array_replace(v_court, v_sub.out_player_id, v_sub.in_player_id);
  END LOOP;
  RETURN v_court;
END;
$$;
REVOKE ALL ON FUNCTION public.lineup_court(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;

--------------------------------------------------------------------------------
-- Scorer functions
--------------------------------------------------------------------------------
-- Both squads, for choosing a lineup.
CREATE FUNCTION public.get_match_squads(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object('team_id', t.id, 'players', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.display_name, 'number', pp.jersey_number, 'position', pp.primary_position) ORDER BY pp.display_name)
      FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id WHERE tp.team_id = t.id AND tp.status = 'ACTIVE'), '[]'::jsonb))), '[]'::jsonb)
    FROM public.matches m JOIN public.teams t ON t.id IN (m.home_team_id, m.away_team_id) WHERE m.id = p_match_id);
END;
$$;

CREATE FUNCTION public.set_set_lineup(p_match_id uuid, p_set_number integer, p_team_id uuid, p_slots uuid[], p_libero uuid DEFAULT NULL)
RETURNS void
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
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized to score this match'; END IF;
  IF v_match.status NOT IN ('SCHEDULED', 'LIVE') THEN RAISE EXCEPTION 'The match is not being played'; END IF;
  IF p_team_id NOT IN (v_match.home_team_id, v_match.away_team_id) THEN RAISE EXCEPTION 'Choose one of the two teams'; END IF;
  SELECT * INTO v_set FROM public.match_sets WHERE match_id = p_match_id AND set_number = p_set_number;
  IF v_set.id IS NULL THEN RAISE EXCEPTION 'Set not found'; END IF;
  IF v_set.status = 'COMPLETED' THEN RAISE EXCEPTION 'That set is already finished'; END IF;
  IF v_set.home_score + v_set.away_score > 0 THEN RAISE EXCEPTION 'The set has started: use substitutions'; END IF;
  IF p_slots IS NULL OR cardinality(p_slots) <> 6 OR (SELECT count(DISTINCT s) FROM unnest(p_slots) s) <> 6 THEN RAISE EXCEPTION 'Choose six different players'; END IF;
  IF (SELECT count(*) FROM public.team_players WHERE team_id = p_team_id AND status = 'ACTIVE' AND player_id = ANY (p_slots)) <> 6 THEN
    RAISE EXCEPTION 'Every player must be in the team squad';
  END IF;
  IF p_libero IS NOT NULL AND (p_libero = ANY (p_slots) OR NOT EXISTS (SELECT 1 FROM public.team_players WHERE team_id = p_team_id AND status = 'ACTIVE' AND player_id = p_libero)) THEN
    RAISE EXCEPTION 'The libero must be a squad player who is not in the starting six';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  DELETE FROM public.match_substitutions WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id;
  INSERT INTO public.match_lineups (match_id, set_number, team_id, slots, libero_id, created_by)
  VALUES (p_match_id, p_set_number, p_team_id, p_slots, p_libero, auth.uid())
  ON CONFLICT (match_id, set_number, team_id) DO UPDATE SET slots = EXCLUDED.slots, libero_id = EXCLUDED.libero_id, created_by = EXCLUDED.created_by, created_at = now();
END;
$$;

CREATE FUNCTION public.record_substitution(p_match_id uuid, p_set_number integer, p_team_id uuid, p_kind text, p_out uuid, p_in uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_set public.match_sets%ROWTYPE;
  v_lineup public.match_lineups%ROWTYPE;
  v_court uuid[];
  v_used integer;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized to score this match'; END IF;
  IF v_match.status <> 'LIVE' AND v_match.status <> 'SCHEDULED' THEN RAISE EXCEPTION 'The match is not being played'; END IF;
  IF p_team_id NOT IN (v_match.home_team_id, v_match.away_team_id) THEN RAISE EXCEPTION 'Choose one of the two teams'; END IF;
  IF p_kind NOT IN ('SUB', 'LIBERO_IN', 'LIBERO_OUT') THEN RAISE EXCEPTION 'Invalid substitution'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('match_scoring:' || p_match_id::text));
  SELECT * INTO v_set FROM public.match_sets WHERE match_id = p_match_id AND set_number = p_set_number;
  IF v_set.id IS NULL OR v_set.status = 'COMPLETED' THEN RAISE EXCEPTION 'That set is not in play'; END IF;
  SELECT * INTO v_lineup FROM public.match_lineups WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id;
  IF v_lineup.id IS NULL THEN RAISE EXCEPTION 'Record the starting lineup first'; END IF;
  v_court := public.lineup_court(p_match_id, p_set_number, p_team_id);
  IF NOT (p_out = ANY (v_court)) THEN RAISE EXCEPTION 'That player is not on court'; END IF;
  IF p_in = ANY (v_court) THEN RAISE EXCEPTION 'That player is already on court'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_players WHERE team_id = p_team_id AND status = 'ACTIVE' AND player_id = p_in) THEN RAISE EXCEPTION 'The player is not in the team squad'; END IF;

  IF p_kind = 'SUB' THEN
    IF p_out = v_lineup.libero_id OR p_in = v_lineup.libero_id THEN RAISE EXCEPTION 'The libero is swapped with a libero replacement, not a substitution'; END IF;
    SELECT count(*) INTO v_used FROM public.match_substitutions WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id AND kind = 'SUB';
    IF v_used >= 6 THEN RAISE EXCEPTION 'Six substitutions have been used in this set'; END IF;
  ELSIF p_kind = 'LIBERO_IN' THEN
    IF v_lineup.libero_id IS NULL OR p_in <> v_lineup.libero_id THEN RAISE EXCEPTION 'Only the designated libero can come on as libero'; END IF;
  ELSE
    IF v_lineup.libero_id IS NULL OR p_out <> v_lineup.libero_id THEN RAISE EXCEPTION 'The libero must be the player going off'; END IF;
  END IF;

  INSERT INTO public.match_substitutions (match_id, set_number, team_id, kind, out_player_id, in_player_id, home_score, away_score, created_by)
  VALUES (p_match_id, p_set_number, p_team_id, p_kind, p_out, p_in, v_set.home_score, v_set.away_score, auth.uid());
  RETURN jsonb_build_object('subs_used', (SELECT count(*) FROM public.match_substitutions WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id AND kind = 'SUB'));
END;
$$;

-- Undo the latest substitution of a team in a set (a mis-tap).
CREATE FUNCTION public.undo_last_substitution(p_match_id uuid, p_set_number integer, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized to score this match'; END IF;
  DELETE FROM public.match_substitutions WHERE id = (
    SELECT id FROM public.match_substitutions WHERE match_id = p_match_id AND set_number = p_set_number AND team_id = p_team_id ORDER BY created_at DESC, id DESC LIMIT 1);
END;
$$;

--------------------------------------------------------------------------------
-- Reading lineups (public for public matches): starting orders, substitutions, and how often each side has
-- won the serve back in each set (each is one rotation), so apps can show the court positions.
--------------------------------------------------------------------------------
CREATE FUNCTION public.get_match_lineups(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RETURN NULL; END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.public_fixture_view WHERE id = p_match_id) OR public.can_run_match(p_match_id)) THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'lineups', COALESCE((SELECT jsonb_agg(jsonb_build_object('set_number', l.set_number, 'team_id', l.team_id, 'libero_id', l.libero_id,
        'slots', (SELECT jsonb_agg(jsonb_build_object('id', pp.id, 'name', pp.display_name, 'number', pp.jersey_number) ORDER BY s.ord)
                  FROM unnest(l.slots) WITH ORDINALITY AS s(pid, ord) JOIN public.player_profiles pp ON pp.id = s.pid),
        'libero', (SELECT jsonb_build_object('id', pp.id, 'name', pp.display_name, 'number', pp.jersey_number) FROM public.player_profiles pp WHERE pp.id = l.libero_id))
        ORDER BY l.set_number, l.team_id) FROM public.match_lineups l WHERE l.match_id = p_match_id), '[]'::jsonb),
    'substitutions', COALESCE((SELECT jsonb_agg(jsonb_build_object('set_number', x.set_number, 'team_id', x.team_id, 'kind', x.kind,
        'out_id', x.out_player_id, 'out_name', po.display_name, 'in_id', x.in_player_id, 'in_name', pi.display_name,
        'home_score', x.home_score, 'away_score', x.away_score) ORDER BY x.created_at, x.id)
        FROM public.match_substitutions x JOIN public.player_profiles po ON po.id = x.out_player_id JOIN public.player_profiles pi ON pi.id = x.in_player_id WHERE x.match_id = p_match_id), '[]'::jsonb),
    'rotations', COALESCE((SELECT jsonb_agg(jsonb_build_object('set_number', r.set_number, 'team_id', r.team_id, 'count', r.n)) FROM (
        SELECT ms.set_number, e.team_id, count(*) AS n FROM (
          SELECT ev.match_set_id, ev.team_id, ev.sequence_number,
                 lag(ev.team_id) OVER (PARTITION BY ev.match_set_id ORDER BY ev.sequence_number) AS prev_team
          FROM public.score_events ev WHERE ev.match_id = p_match_id AND ev.event_type = 'POINT') e
        JOIN public.match_sets ms ON ms.id = e.match_set_id
        -- a point by the side that was not serving: the first point of a set counts against the first server
        WHERE e.team_id <> COALESCE(e.prev_team, ms.first_serve_team_id)
        GROUP BY ms.set_number, e.team_id) r), '[]'::jsonb),
    'mvp', (SELECT jsonb_build_object('id', pp.id, 'name', pp.display_name) FROM public.match_awards a JOIN public.player_profiles pp ON pp.id = a.mvp_player_id WHERE a.match_id = p_match_id));
END;
$$;

--------------------------------------------------------------------------------
-- Awards
--------------------------------------------------------------------------------
CREATE FUNCTION public.set_match_mvp(p_match_id uuid, p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
BEGIN
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_match.status <> 'COMPLETED' THEN RAISE EXCEPTION 'Pick the player of the match once it is finished'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_players WHERE team_id IN (v_match.home_team_id, v_match.away_team_id) AND player_id = p_player_id) THEN
    RAISE EXCEPTION 'The player is not in either squad';
  END IF;
  INSERT INTO public.match_awards (match_id, mvp_player_id, created_by) VALUES (p_match_id, p_player_id, auth.uid())
  ON CONFLICT (match_id) DO UPDATE SET mvp_player_id = EXCLUDED.mvp_player_id, created_by = EXCLUDED.created_by, created_at = now();
END;
$$;

CREATE FUNCTION public.clear_match_mvp(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.can_run_match(p_match_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.match_awards WHERE match_id = p_match_id;
END;
$$;

CREATE FUNCTION public.set_tournament_award(p_tournament_id uuid, p_name text, p_player_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION 'Give the award a name of up to 60 characters'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND status = 'APPROVED') THEN
    RAISE EXCEPTION 'The player is not registered in this tournament';
  END IF;
  INSERT INTO public.tournament_awards (tournament_id, name, player_id, note, created_by) VALUES (p_tournament_id, btrim(p_name), p_player_id, NULLIF(btrim(p_note), ''), auth.uid())
  ON CONFLICT (tournament_id, name) DO UPDATE SET player_id = EXCLUDED.player_id, note = EXCLUDED.note, created_by = EXCLUDED.created_by, created_at = now();
END;
$$;

CREATE FUNCTION public.remove_tournament_award(p_award_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.tournament_awards WHERE id = p_award_id;
  IF v_tournament IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.tournament_awards WHERE id = p_award_id;
END;
$$;

-- Awards of a tournament (public for public tournaments).
CREATE FUNCTION public.get_tournament_awards(p_tournament_id uuid)
RETURNS TABLE (id uuid, name text, player_id uuid, player_name text, note text)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.id, a.name, a.player_id, pp.display_name, a.note
  FROM public.tournament_awards a JOIN public.player_profiles pp ON pp.id = a.player_id
  WHERE a.tournament_id = p_tournament_id
    AND (EXISTS (SELECT 1 FROM public.public_tournament_view v WHERE v.id = p_tournament_id) OR public.is_tournament_organizer(p_tournament_id))
  ORDER BY a.created_at;
$$;

-- A player's awards across public tournaments, for the player page.
CREATE FUNCTION public.get_player_awards(p_player_id uuid)
RETURNS TABLE (kind text, title text, tournament_name text, tournament_slug text, detail text, awarded_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT 'TOURNAMENT', a.name, v.name, v.slug, a.note, a.created_at
  FROM public.tournament_awards a JOIN public.public_tournament_view v ON v.id = a.tournament_id WHERE a.player_id = p_player_id
  UNION ALL
  SELECT 'MVP', 'Player of the match', v.name, v.slug, h.name || ' vs ' || w.name, a.created_at
  FROM public.match_awards a JOIN public.matches m ON m.id = a.match_id
    JOIN public.public_tournament_view v ON v.id = m.tournament_id
    JOIN public.teams h ON h.id = m.home_team_id JOIN public.teams w ON w.id = m.away_team_id
  WHERE a.mvp_player_id = p_player_id
  ORDER BY 6 DESC;
$$;

REVOKE ALL ON FUNCTION public.get_match_squads(uuid), public.set_set_lineup(uuid, integer, uuid, uuid[], uuid), public.record_substitution(uuid, integer, uuid, text, uuid, uuid),
  public.undo_last_substitution(uuid, integer, uuid), public.get_match_lineups(uuid), public.set_match_mvp(uuid, uuid), public.clear_match_mvp(uuid),
  public.set_tournament_award(uuid, text, uuid, text), public.remove_tournament_award(uuid), public.get_tournament_awards(uuid), public.get_player_awards(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_match_lineups(uuid), public.get_tournament_awards(uuid), public.get_player_awards(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_match_squads(uuid), public.set_set_lineup(uuid, integer, uuid, uuid[], uuid), public.record_substitution(uuid, integer, uuid, text, uuid, uuid),
  public.undo_last_substitution(uuid, integer, uuid), public.set_match_mvp(uuid, uuid), public.clear_match_mvp(uuid),
  public.set_tournament_award(uuid, text, uuid, text), public.remove_tournament_award(uuid) TO authenticated;
