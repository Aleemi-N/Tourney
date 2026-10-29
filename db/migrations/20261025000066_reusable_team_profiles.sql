-- v2: reusable team profiles. A profile is a team's identity (name, logo, colours,
-- place) owned by a user and reused across tournaments; each tournament still gets
-- its own teams row, linked back to the profile, so stats can follow the team.

CREATE TABLE public.team_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  short_name text,
  logo_path text,
  place text,
  primary_color text CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_profiles_owner_idx ON public.team_profiles (owner_user_id);

ALTER TABLE public.teams ADD COLUMN team_profile_id uuid REFERENCES public.team_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.team_owner_applications ADD COLUMN team_profile_id uuid REFERENCES public.team_profiles(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX teams_one_profile_per_tournament ON public.teams (tournament_id, team_profile_id) WHERE team_profile_id IS NOT NULL;

ALTER TABLE public.team_profiles ENABLE ROW LEVEL SECURITY;
-- Owners see their own profiles; everything else goes through definer RPCs.
CREATE POLICY team_profiles_owner_select ON public.team_profiles FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
REVOKE ALL ON public.team_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.team_profiles TO authenticated;

-- Existing teams: one profile per primary owner and team name, so a team that played
-- several tournaments under the same owner becomes one profile. Teams without an owner
-- stay unlinked until someone applies for them.
CREATE TEMP TABLE _team_map ON COMMIT DROP AS
SELECT t.id AS team_id, po.user_id, lower(btrim(t.name)) AS key, t.created_at
FROM public.teams t
JOIN (
  SELECT DISTINCT ON (team_id) team_id, user_id FROM public.team_owners ORDER BY team_id, is_primary DESC, created_at
) po ON po.team_id = t.id;

CREATE TEMP TABLE _profile_map ON COMMIT DROP AS
SELECT user_id, key, gen_random_uuid() AS profile_id,
       (array_agg(team_id ORDER BY created_at DESC))[1] AS latest_team_id
FROM _team_map GROUP BY user_id, key;

INSERT INTO public.team_profiles (id, owner_user_id, name, short_name, logo_path, place, primary_color, secondary_color)
SELECT p.profile_id, p.user_id, t.name, t.short_name, t.logo_path, t.place, t.primary_color, t.secondary_color
FROM _profile_map p JOIN public.teams t ON t.id = p.latest_team_id;

UPDATE public.teams t SET team_profile_id = p.profile_id
FROM _team_map m JOIN _profile_map p ON p.user_id = m.user_id AND p.key = m.key
WHERE t.id = m.team_id;

-- A team the owner can reuse next time.
DROP FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text, text, text);
CREATE FUNCTION public.submit_team_owner_application(
  p_tournament_id uuid,
  p_proposed_team_name text,
  p_team_short_name text DEFAULT NULL,
  p_logo_path text DEFAULT NULL,
  p_place text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_primary_color text DEFAULT NULL,
  p_secondary_color text DEFAULT NULL,
  p_team_profile_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tournament_status text;
  v_format text;
  v_app_id uuid;
  v_user_id uuid := auth.uid();
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthenticated'; END IF;
  IF p_logo_path IS NULL OR trim(p_logo_path) = '' THEN RAISE EXCEPTION 'Team logo is required'; END IF;

  IF p_team_profile_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.team_profiles WHERE id = p_team_profile_id AND owner_user_id = v_user_id) THEN
      RAISE EXCEPTION 'Team profile not found';
    END IF;
    IF EXISTS (SELECT 1 FROM public.teams WHERE tournament_id = p_tournament_id AND team_profile_id = p_team_profile_id) THEN
      RAISE EXCEPTION 'This team is already in the tournament';
    END IF;
  END IF;

  SELECT status, format INTO v_tournament_status, v_format FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
  IF v_tournament_status != 'REGISTRATION' THEN RAISE EXCEPTION 'Tournament is not open for registration'; END IF;
  IF v_format != 'LEAGUE' THEN RAISE EXCEPTION 'Tournament format does not support teams'; END IF;

  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  IF NOT v_settings.team_registration_enabled THEN RAISE EXCEPTION 'Team owner registration is currently closed'; END IF;
  IF v_settings.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_approved_count FROM public.teams WHERE tournament_id = p_tournament_id;
    IF v_approved_count >= v_settings.max_teams THEN RAISE EXCEPTION 'Maximum team capacity has been reached'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.team_owner_applications WHERE tournament_id = p_tournament_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Application already exists';
  END IF;

  INSERT INTO public.team_owner_applications (
    tournament_id, user_id, proposed_team_name, team_short_name,
    logo_path, place, phone, email, primary_color, secondary_color, team_profile_id, status
  )
  VALUES (
    p_tournament_id, v_user_id, p_proposed_team_name, p_team_short_name,
    p_logo_path, p_place, p_phone, p_email, lower(p_primary_color), lower(p_secondary_color), p_team_profile_id, 'PENDING'
  )
  RETURNING id INTO v_app_id;
  RETURN v_app_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text, text, text, uuid) TO authenticated;

-- Approval links the team to its profile (creating one for a first-time team) and
-- keeps the profile's identity in step with the team's latest details.
CREATE OR REPLACE FUNCTION public.approve_team_owner_application(p_application_id uuid, p_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.team_owner_applications%ROWTYPE;
  v_team_id uuid;
  v_profile_id uuid;
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
BEGIN
  SELECT * INTO v_app FROM public.team_owner_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF NOT public.is_tournament_organizer(v_app.tournament_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_app.status = 'APPROVED' THEN RETURN; END IF;
  IF v_app.status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot approve application in status: %', v_app.status;
  END IF;

  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = v_app.tournament_id FOR UPDATE;
  IF v_settings.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_approved_count FROM public.teams WHERE tournament_id = v_app.tournament_id;
    IF v_approved_count >= v_settings.max_teams THEN RAISE EXCEPTION 'Maximum team capacity has been reached'; END IF;
  END IF;

  v_profile_id := v_app.team_profile_id;
  IF v_profile_id IS NULL THEN
    INSERT INTO public.team_profiles (owner_user_id, name, short_name, logo_path, place, primary_color, secondary_color)
    VALUES (v_app.user_id, v_app.proposed_team_name, v_app.team_short_name, v_app.logo_path, v_app.place, v_app.primary_color, v_app.secondary_color)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE public.team_profiles
    SET name = v_app.proposed_team_name, short_name = v_app.team_short_name, logo_path = v_app.logo_path, place = v_app.place,
        primary_color = v_app.primary_color, secondary_color = v_app.secondary_color, updated_at = now()
    WHERE id = v_profile_id;
  END IF;

  INSERT INTO public.teams (tournament_id, name, short_name, logo_path, place, primary_color, secondary_color, team_profile_id)
  VALUES (v_app.tournament_id, v_app.proposed_team_name, v_app.team_short_name, v_app.logo_path, v_app.place,
          v_app.primary_color, v_app.secondary_color, v_profile_id)
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_owners (team_id, user_id, is_primary) VALUES (v_team_id, v_app.user_id, true);

  INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id)
  VALUES (v_app.tournament_id, v_app.user_id, 'TEAM_OWNER', v_team_id)
  ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET team_id = v_team_id;

  UPDATE public.team_owner_applications
  SET status = 'APPROVED', review_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id;
END;
$function$;
