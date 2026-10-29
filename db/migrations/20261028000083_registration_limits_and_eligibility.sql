-- v2: registration limits and eligibility.
--  * A registration deadline (players and teams).
--  * A limit on approved players. Players who register after it is reached are kept on a waitlist, in order, and move up
--    as the organizer approves or removes people or raises the limit. (Teams already have max_teams, which stops new
--    applications when the tournament has that many teams.)
--  * An age category by date of birth ("born on or after 1 Jan 2008" for an Under-19 event), checked when registering.
-- Organizers adding people themselves are not stopped by the deadline or the age limits.

ALTER TABLE public.tournament_settings
  ADD COLUMN registration_closes_at timestamptz,
  ADD COLUMN max_players integer CHECK (max_players IS NULL OR max_players BETWEEN 1 AND 100000),
  ADD COLUMN born_on_or_after date,
  ADD COLUMN born_on_or_before date,
  ADD CONSTRAINT tournament_settings_born_range CHECK (born_on_or_after IS NULL OR born_on_or_before IS NULL OR born_on_or_after <= born_on_or_before);

ALTER TABLE public.player_tournament_registrations ADD COLUMN waitlist_position integer;

--------------------------------------------------------------------------------
-- Waitlist order
--------------------------------------------------------------------------------
CREATE FUNCTION public.refresh_waitlist(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max integer;
  v_left integer;
BEGIN
  SELECT max_players INTO v_max FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  v_left := GREATEST(COALESCE(v_max, 0) - (SELECT count(*) FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id AND status = 'APPROVED'), 0);
  UPDATE public.player_tournament_registrations r SET waitlist_position = x.pos
  FROM (
    SELECT id, CASE WHEN v_max IS NULL OR rn <= v_left THEN NULL ELSE (rn - v_left)::integer END AS pos
    FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.player_tournament_registrations
          WHERE tournament_id = p_tournament_id AND status IN ('PENDING', 'CHANGES_REQUESTED')) q
  ) x
  WHERE r.id = x.id AND r.waitlist_position IS DISTINCT FROM x.pos;
  UPDATE public.player_tournament_registrations SET waitlist_position = NULL
  WHERE tournament_id = p_tournament_id AND status NOT IN ('PENDING', 'CHANGES_REQUESTED') AND waitlist_position IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_waitlist(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.refresh_waitlist_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_waitlist(NEW.tournament_id);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_waitlist_trigger() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER refresh_waitlist AFTER INSERT OR UPDATE OF status ON public.player_tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.refresh_waitlist_trigger();
CREATE TRIGGER refresh_waitlist_on_limit AFTER UPDATE OF max_players ON public.tournament_settings FOR EACH ROW WHEN (OLD.max_players IS DISTINCT FROM NEW.max_players)
  EXECUTE FUNCTION public.refresh_waitlist_trigger();

--------------------------------------------------------------------------------
-- The rules, enforced whichever screen is used
--------------------------------------------------------------------------------
CREATE FUNCTION public.check_player_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  s public.tournament_settings;
  v_dob date;
  v_staff boolean := auth.uid() IS NOT NULL AND public.is_tournament_organizer(NEW.tournament_id);
BEGIN
  SELECT * INTO s FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id;
  IF NOT v_staff THEN
    IF s.registration_closes_at IS NOT NULL AND now() > s.registration_closes_at THEN RAISE EXCEPTION 'Registration for this tournament has closed'; END IF;
    IF s.born_on_or_after IS NOT NULL OR s.born_on_or_before IS NOT NULL THEN
      SELECT date_of_birth INTO v_dob FROM public.player_profiles WHERE id = NEW.player_id;
      IF v_dob IS NULL THEN RAISE EXCEPTION 'This tournament has an age category, so your date of birth is needed. Add it to your profile.'; END IF;
      IF s.born_on_or_after IS NOT NULL AND v_dob < s.born_on_or_after THEN RAISE EXCEPTION 'Players for this tournament must be born on or after %', to_char(s.born_on_or_after, 'DD Mon YYYY'); END IF;
      IF s.born_on_or_before IS NOT NULL AND v_dob > s.born_on_or_before THEN RAISE EXCEPTION 'Players for this tournament must be born on or before %', to_char(s.born_on_or_before, 'DD Mon YYYY'); END IF;
    END IF;
  END IF;
  IF NEW.status = 'APPROVED' AND s.max_players IS NOT NULL
     AND (SELECT count(*) FROM public.player_tournament_registrations WHERE tournament_id = NEW.tournament_id AND status = 'APPROVED') >= s.max_players THEN
    RAISE EXCEPTION 'The tournament is full (% players). Raise the player limit to approve more.', s.max_players;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_player_registration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER check_player_registration BEFORE INSERT ON public.player_tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.check_player_registration();

CREATE FUNCTION public.check_player_approval_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_max integer;
BEGIN
  IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
    SELECT max_players INTO v_max FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id;
    IF v_max IS NOT NULL AND (SELECT count(*) FROM public.player_tournament_registrations WHERE tournament_id = NEW.tournament_id AND status = 'APPROVED' AND id <> NEW.id) >= v_max THEN
      RAISE EXCEPTION 'The tournament is full (% players). Raise the player limit to approve more.', v_max;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_player_approval_limit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER check_player_approval_limit BEFORE UPDATE OF status ON public.player_tournament_registrations FOR EACH ROW EXECUTE FUNCTION public.check_player_approval_limit();

CREATE FUNCTION public.check_team_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_closes timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_tournament_organizer(NEW.tournament_id) THEN RETURN NEW; END IF;
  SELECT registration_closes_at INTO v_closes FROM public.tournament_settings WHERE tournament_id = NEW.tournament_id;
  IF v_closes IS NOT NULL AND now() > v_closes THEN RAISE EXCEPTION 'Registration for this tournament has closed'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_team_application() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER check_team_application BEFORE INSERT ON public.team_owner_applications FOR EACH ROW EXECUTE FUNCTION public.check_team_application();

--------------------------------------------------------------------------------
-- Organizer settings and the public status
--------------------------------------------------------------------------------
CREATE FUNCTION public.set_registration_limits(p_tournament_id uuid, p_closes_at timestamptz, p_max_players integer, p_born_after date, p_born_before date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_approved integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_max_players IS NOT NULL AND p_max_players < 1 THEN RAISE EXCEPTION 'The player limit must be at least 1'; END IF;
  SELECT count(*) INTO v_approved FROM public.player_tournament_registrations WHERE tournament_id = p_tournament_id AND status = 'APPROVED';
  IF p_max_players IS NOT NULL AND p_max_players < v_approved THEN RAISE EXCEPTION 'The limit cannot be below the % players already approved', v_approved; END IF;
  IF p_born_after IS NOT NULL AND p_born_before IS NOT NULL AND p_born_after > p_born_before THEN RAISE EXCEPTION '"Born on or after" must not be later than "born on or before"'; END IF;
  UPDATE public.tournament_settings SET registration_closes_at = p_closes_at, max_players = p_max_players, born_on_or_after = p_born_after, born_on_or_before = p_born_before
  WHERE tournament_id = p_tournament_id;
  PERFORM public.refresh_waitlist(p_tournament_id);
END;
$$;

-- What a person registering needs to know: is it open, until when, how many places, who may play.
CREATE FUNCTION public.get_registration_status(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'closes_at', s.registration_closes_at,
    'timezone', COALESCE(s.timezone, 'UTC'),
    'open', t.status = 'REGISTRATION' AND (s.registration_closes_at IS NULL OR now() <= s.registration_closes_at),
    'max_players', s.max_players,
    'players_approved', (SELECT count(*) FROM public.player_tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'APPROVED'),
    'player_spots_left', CASE WHEN s.max_players IS NULL THEN NULL ELSE GREATEST(s.max_players - (SELECT count(*) FROM public.player_tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'APPROVED'), 0) END,
    'waitlist', (SELECT count(*) FROM public.player_tournament_registrations r WHERE r.tournament_id = t.id AND r.waitlist_position IS NOT NULL),
    'max_teams', s.max_teams,
    'teams', (SELECT count(*) FROM public.teams tm WHERE tm.tournament_id = t.id),
    'born_on_or_after', s.born_on_or_after,
    'born_on_or_before', s.born_on_or_before)
  FROM public.tournaments t JOIN public.tournament_settings s ON s.tournament_id = t.id
  WHERE t.id = p_tournament_id
    AND (EXISTS (SELECT 1 FROM public.public_tournament_view v WHERE v.id = t.id) OR public.is_tournament_organizer(t.id));
$$;

REVOKE ALL ON FUNCTION public.set_registration_limits(uuid, timestamptz, integer, date, date), public.get_registration_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registration_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_registration_limits(uuid, timestamptz, integer, date, date) TO authenticated;
