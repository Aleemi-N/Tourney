-- v2: a team owner picks the team's colours when applying; the approved team
-- inherits them, and the organizer can change them later through an audited RPC.

ALTER TABLE public.team_owner_applications
  ADD COLUMN primary_color text CONSTRAINT team_owner_applications_primary_color_hex CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN secondary_color text CONSTRAINT team_owner_applications_secondary_color_hex CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$');

-- Existing rows are not re-checked; every new write must be a 6-digit hex colour.
ALTER TABLE public.teams
  ADD CONSTRAINT teams_primary_color_hex CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID,
  ADD CONSTRAINT teams_secondary_color_hex CHECK (secondary_color ~ '^#[0-9a-fA-F]{6}$') NOT VALID;

DROP FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text);

CREATE FUNCTION public.submit_team_owner_application(
  p_tournament_id uuid,
  p_proposed_team_name text,
  p_team_short_name text DEFAULT NULL,
  p_logo_path text DEFAULT NULL,
  p_place text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_primary_color text DEFAULT NULL,
  p_secondary_color text DEFAULT NULL
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_logo_path IS NULL OR trim(p_logo_path) = '' THEN
    RAISE EXCEPTION 'Team logo is required';
  END IF;

  SELECT status, format INTO v_tournament_status, v_format
  FROM public.tournaments WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF v_tournament_status != 'REGISTRATION' THEN
    RAISE EXCEPTION 'Tournament is not open for registration';
  END IF;
  IF v_format != 'LEAGUE' THEN
    RAISE EXCEPTION 'Tournament format does not support teams';
  END IF;

  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  IF NOT v_settings.team_registration_enabled THEN
    RAISE EXCEPTION 'Team owner registration is currently closed';
  END IF;
  IF v_settings.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_approved_count FROM public.teams WHERE tournament_id = p_tournament_id;
    IF v_approved_count >= v_settings.max_teams THEN
      RAISE EXCEPTION 'Maximum team capacity has been reached';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_owner_applications
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Application already exists';
  END IF;

  INSERT INTO public.team_owner_applications (
    tournament_id, user_id, proposed_team_name, team_short_name,
    logo_path, place, phone, email, primary_color, secondary_color, status
  )
  VALUES (
    p_tournament_id, v_user_id, p_proposed_team_name, p_team_short_name,
    p_logo_path, p_place, p_phone, p_email, lower(p_primary_color), lower(p_secondary_color), 'PENDING'
  )
  RETURNING id INTO v_app_id;

  RETURN v_app_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_team_owner_application(uuid, text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_team_owner_application(p_application_id uuid, p_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.team_owner_applications%ROWTYPE;
  v_team_id uuid;
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
BEGIN
  SELECT * INTO v_app FROM public.team_owner_applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT public.is_tournament_organizer(v_app.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_app.status = 'APPROVED' THEN
    RETURN;
  END IF;
  IF v_app.status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot approve application in status: %', v_app.status;
  END IF;

  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = v_app.tournament_id FOR UPDATE;
  IF v_settings.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_approved_count FROM public.teams WHERE tournament_id = v_app.tournament_id;
    IF v_approved_count >= v_settings.max_teams THEN
      RAISE EXCEPTION 'Maximum team capacity has been reached';
    END IF;
  END IF;

  INSERT INTO public.teams (tournament_id, name, short_name, logo_path, place, primary_color, secondary_color)
  VALUES (v_app.tournament_id, v_app.proposed_team_name, v_app.team_short_name, v_app.logo_path, v_app.place,
          v_app.primary_color, v_app.secondary_color)
  RETURNING id INTO v_team_id;

  INSERT INTO public.team_owners (team_id, user_id, is_primary)
  VALUES (v_team_id, v_app.user_id, true);

  INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id)
  VALUES (v_app.tournament_id, v_app.user_id, 'TEAM_OWNER', v_team_id)
  ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET team_id = v_team_id;

  UPDATE public.team_owner_applications
  SET status = 'APPROVED', review_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_team_colors(p_team_id uuid, p_primary_color text, p_secondary_color text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_primary text := lower(nullif(btrim(p_primary_color), ''));
  v_secondary text := lower(nullif(btrim(p_secondary_color), ''));
BEGIN
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF v_team.id IS NULL OR NOT public.is_tournament_organizer(v_team.tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'A primary team colour is required';
  END IF;

  UPDATE public.teams
  SET primary_color = v_primary, secondary_color = v_secondary, updated_at = now()
  WHERE id = v_team.id;

  INSERT INTO public.audit_logs (
    organization_id, tournament_id, user_id, action, entity_type, entity_id, before_json, after_json, reason
  )
  SELECT t.organization_id, v_team.tournament_id, auth.uid(), 'TEAM_COLORS_CHANGED', 'TEAM', v_team.id,
         jsonb_build_object('primary_color', v_team.primary_color, 'secondary_color', v_team.secondary_color),
         jsonb_build_object('primary_color', v_primary, 'secondary_color', v_secondary),
         'Team colours changed by tournament organizer'
  FROM public.tournaments t WHERE t.id = v_team.tournament_id;

  RETURN jsonb_build_object('team_id', v_team.id, 'primary_color', v_primary, 'secondary_color', v_secondary);
END;
$$;

REVOKE ALL ON FUNCTION public.set_team_colors(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_colors(uuid, text, text) TO authenticated;
