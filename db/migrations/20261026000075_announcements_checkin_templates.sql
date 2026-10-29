-- v2: organizer tools. Announcements (to everyone in a tournament or to one team, with a push alert),
-- match check-in (teams confirm they have arrived; the organizer can then declare a walkover for a no-show),
-- and duplicating a tournament as a template. Schedule-change alerts now use the tournament's own timezone.

--------------------------------------------------------------------------------
-- Announcements
--------------------------------------------------------------------------------
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE, -- NULL: everyone following the tournament
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_tournament_idx ON public.announcements (tournament_id, created_at DESC);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.post_announcement(p_tournament_id uuid, p_title text, p_body text, p_team_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_users uuid[];
  v_tokens text[];
  v_tournament_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'The title must be 1 to 80 characters'; END IF;
  IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'The message must be 1 to 500 characters'; END IF;
  IF p_team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND tournament_id = p_tournament_id) THEN RAISE EXCEPTION 'Team not found in this tournament'; END IF;

  INSERT INTO public.announcements (tournament_id, team_id, title, body, created_by)
  VALUES (p_tournament_id, p_team_id, btrim(p_title), btrim(p_body), auth.uid()) RETURNING id INTO v_id;

  SELECT name INTO v_tournament_name FROM public.tournaments WHERE id = p_tournament_id;
  IF p_team_id IS NULL THEN
    SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_users FROM (
      SELECT o.user_id AS u FROM public.team_owners o JOIN public.teams t ON t.id = o.team_id WHERE t.tournament_id = p_tournament_id AND o.status = 'ACTIVE'
      UNION SELECT pp.user_id FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id = r.player_id WHERE r.tournament_id = p_tournament_id AND r.status = 'APPROVED' AND pp.user_id IS NOT NULL
    ) s;
    SELECT COALESCE(array_agg(DISTINCT token), '{}') INTO v_tokens FROM public.push_follows WHERE kind = 'TOURNAMENT' AND target_id = p_tournament_id;
  ELSE
    SELECT COALESCE(array_agg(DISTINCT u), '{}') INTO v_users FROM (
      SELECT user_id AS u FROM public.team_owners WHERE team_id = p_team_id AND status = 'ACTIVE'
      UNION SELECT pp.user_id FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id WHERE tp.team_id = p_team_id AND tp.status = 'ACTIVE' AND pp.user_id IS NOT NULL
    ) s;
    SELECT COALESCE(array_agg(DISTINCT token), '{}') INTO v_tokens FROM public.push_follows WHERE kind = 'TEAM' AND target_id = p_team_id;
  END IF;
  PERFORM public.enqueue_push(v_users, btrim(p_title), btrim(p_body) || ' · ' || v_tournament_name,
    jsonb_build_object('kind', 'ANNOUNCEMENT', 'announcementId', v_id, 'tournamentId', p_tournament_id), v_tokens);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.delete_announcement(p_announcement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tournament uuid;
BEGIN
  SELECT tournament_id INTO v_tournament FROM public.announcements WHERE id = p_announcement_id;
  IF v_tournament IS NULL THEN RETURN; END IF;
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(v_tournament) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM public.announcements WHERE id = p_announcement_id;
END;
$$;

-- Public announcements of a public tournament, plus team announcements the caller is part of (and everything for organizers).
CREATE FUNCTION public.get_announcements(p_tournament_id uuid)
RETURNS TABLE (id uuid, team_id uuid, team_name text, title text, body text, created_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.id, a.team_id, t.name, a.title, a.body, a.created_at
  FROM public.announcements a LEFT JOIN public.teams t ON t.id = a.team_id
  WHERE a.tournament_id = p_tournament_id
    AND (public.is_tournament_organizer(p_tournament_id)
      OR (a.team_id IS NULL AND EXISTS (SELECT 1 FROM public.public_tournament_view v WHERE v.id = p_tournament_id))
      OR (a.team_id IS NOT NULL AND auth.uid() IS NOT NULL AND (
            EXISTS (SELECT 1 FROM public.team_owners o WHERE o.team_id = a.team_id AND o.user_id = auth.uid() AND o.status = 'ACTIVE')
         OR EXISTS (SELECT 1 FROM public.team_players tp JOIN public.player_profiles pp ON pp.id = tp.player_id WHERE tp.team_id = a.team_id AND tp.status = 'ACTIVE' AND pp.user_id = auth.uid()))))
  ORDER BY a.created_at DESC LIMIT 50;
$$;

--------------------------------------------------------------------------------
-- Match check-in
--------------------------------------------------------------------------------
CREATE TABLE public.match_checkins (
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_in_by uuid REFERENCES public.profiles(id),
  PRIMARY KEY (match_id, team_id)
);
ALTER TABLE public.match_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_checkins FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.check_in_team(p_match_id uuid, p_team_id uuid)
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
  IF p_team_id NOT IN (v_match.home_team_id, v_match.away_team_id) THEN RAISE EXCEPTION 'That team is not in this match'; END IF;
  IF auth.uid() IS NULL OR NOT (
       public.can_run_match(p_match_id)
    OR EXISTS (SELECT 1 FROM public.team_owners o WHERE o.team_id = p_team_id AND o.user_id = auth.uid() AND o.status = 'ACTIVE')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_match.status <> 'SCHEDULED' THEN RAISE EXCEPTION 'Check-in is only open before the match starts'; END IF;
  INSERT INTO public.match_checkins (match_id, team_id, checked_in_by) VALUES (p_match_id, p_team_id, auth.uid()) ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.undo_check_in(p_match_id uuid, p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
       public.can_run_match(p_match_id)
    OR EXISTS (SELECT 1 FROM public.team_owners o WHERE o.team_id = p_team_id AND o.user_id = auth.uid() AND o.status = 'ACTIVE')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.match_checkins WHERE match_id = p_match_id AND team_id = p_team_id;
END;
$$;

CREATE FUNCTION public.get_match_checkins(p_match_id uuid)
RETURNS TABLE (team_id uuid, checked_in_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT c.team_id, c.checked_in_at FROM public.match_checkins c
  WHERE c.match_id = p_match_id AND (EXISTS (SELECT 1 FROM public.public_fixture_view f WHERE f.id = p_match_id) OR public.can_run_match(p_match_id));
$$;

--------------------------------------------------------------------------------
-- Duplicate a tournament as a template: settings, default format, price categories and colours; no teams, players or fixtures.
--------------------------------------------------------------------------------
CREATE FUNCTION public.duplicate_tournament(p_source uuid, p_name text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_src public.tournaments%ROWTYPE;
  v_set public.tournament_settings%ROWTYPE;
  v_rule public.volleyball_rules%ROWTYPE;
  v_new uuid;
  v_created json;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_source) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO v_src FROM public.tournaments WHERE id = p_source;
  SELECT * INTO v_set FROM public.tournament_settings WHERE tournament_id = p_source;
  -- The tournament-wide default format, or failing that the format of its first stage.
  SELECT * INTO v_rule FROM public.volleyball_rules WHERE tournament_id = p_source ORDER BY (stage_id IS NOT NULL), created_at LIMIT 1;

  v_created := public.create_tournament_draft(p_name, p_slug, v_src.description, v_src.format, v_src.league_mode,
    jsonb_build_object('max_teams', v_set.max_teams, 'min_squad_size', v_set.min_squad_size, 'max_squad_size', v_set.max_squad_size,
      'player_registration_enabled', v_set.player_registration_enabled, 'owner_registration_mode', v_set.owner_registration_mode,
      'public_live_enabled', v_set.public_live_enabled, 'timezone', v_set.timezone),
    jsonb_build_object('sets_to_win', COALESCE(v_rule.sets_to_win, 2), 'win_by_two', COALESCE(v_rule.win_by_two, true)));
  IF (v_created->>'idempotent')::boolean THEN RAISE EXCEPTION 'That address is already used by one of your tournaments'; END IF;
  v_new := (v_created->>'tournament_id')::uuid;

  UPDATE public.tournament_settings SET team_registration_enabled = v_set.team_registration_enabled,
    auction_starting_purse = v_set.auction_starting_purse, auction_base_price = v_set.auction_base_price, auction_bid_increment = v_set.auction_bid_increment,
    icon_selection_method = v_set.icon_selection_method, setter_selection_method = v_set.setter_selection_method, reauction_price_rule = v_set.reauction_price_rule
  WHERE tournament_id = v_new;

  -- The exact set targets of the default format.
  IF v_rule.id IS NOT NULL THEN
    PERFORM public.save_volleyball_rule(v_new, NULL, v_rule.sets_to_win, v_rule.win_by_two,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('set_number', set_number, 'target_points', target_points) ORDER BY set_number) FROM public.volleyball_set_rules WHERE volleyball_rule_id = v_rule.id), '[]'::jsonb));
  END IF;

  INSERT INTO public.tournament_auction_categories (tournament_id, category_code, display_name, base_price, display_order)
  SELECT v_new, category_code, display_name, base_price, display_order FROM public.tournament_auction_categories WHERE tournament_id = p_source;

  INSERT INTO public.tournament_branding (tournament_id, primary_color, secondary_color)
  SELECT v_new, primary_color, secondary_color FROM public.tournament_branding WHERE tournament_id = p_source
  ON CONFLICT (tournament_id) DO UPDATE SET primary_color = EXCLUDED.primary_color, secondary_color = EXCLUDED.secondary_color;
  RETURN v_new;
END;
$$;

--------------------------------------------------------------------------------
-- Schedule-change alerts in the tournament's own timezone
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.push_match_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_home text;
  v_away text;
  v_title text;
  v_body text;
  v_tz text;
BEGIN
  IF NEW.home_team_id IS NULL OR NEW.away_team_id IS NULL OR OLD.status IN ('COMPLETED', 'LIVE') THEN RETURN NULL; END IF;
  IF NEW.status IN ('POSTPONED', 'CANCELLED') AND OLD.status IS DISTINCT FROM NEW.status THEN
    v_title := CASE NEW.status WHEN 'POSTPONED' THEN 'Match postponed' ELSE 'Match cancelled' END;
  ELSIF NEW.status = 'SCHEDULED' AND OLD.scheduled_at IS NOT NULL AND NEW.scheduled_at IS NOT NULL AND OLD.scheduled_at <> NEW.scheduled_at THEN
    v_title := 'Match rescheduled';
  ELSE
    RETURN NULL;
  END IF;
  SELECT name INTO v_home FROM public.teams WHERE id = NEW.home_team_id;
  SELECT name INTO v_away FROM public.teams WHERE id = NEW.away_team_id;
  SELECT COALESCE((SELECT timezone FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id), 'Asia/Kolkata') INTO v_tz;
  v_body := v_home || ' vs ' || v_away;
  IF v_title = 'Match rescheduled' THEN
    v_body := v_body || ' is now ' || to_char(NEW.scheduled_at AT TIME ZONE v_tz, 'Dy DD Mon, HH12:MI AM') || '.';
  ELSE
    v_body := v_body || ' will not be played at the planned time.';
  END IF;
  PERFORM public.enqueue_push(public.push_match_people(NEW.home_team_id, NEW.away_team_id), v_title, v_body,
    jsonb_build_object('kind', 'MATCH_SCHEDULE', 'matchId', NEW.id),
    public.push_match_followers(NEW.id, NEW.home_team_id, NEW.away_team_id, NEW.tournament_id));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.post_announcement(uuid, text, text, uuid), public.delete_announcement(uuid), public.get_announcements(uuid),
  public.check_in_team(uuid, uuid), public.undo_check_in(uuid, uuid), public.get_match_checkins(uuid), public.duplicate_tournament(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_announcements(uuid), public.get_match_checkins(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_announcement(uuid, text, text, uuid), public.delete_announcement(uuid), public.check_in_team(uuid, uuid),
  public.undo_check_in(uuid, uuid), public.duplicate_tournament(uuid, text, text) TO authenticated;
