-- 20260920000020_enforce_mandatory_photos.sql
-- Enforce mandatory photos for profiles and teams

--------------------------------------------------------------------------------
-- 1. UPDATE update_player_profile
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_player_profile(
  p_display_name text,
  p_primary_position text,
  p_photo_path text,
  p_date_of_birth date DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_place text DEFAULT NULL,
  p_height_cm numeric DEFAULT NULL,
  p_secondary_position text DEFAULT NULL,
  p_playing_history text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_photo_path IS NULL OR trim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'Profile photo is required';
  END IF;

  INSERT INTO public.player_profiles (
    user_id, display_name, primary_position, photo_path, date_of_birth,
    phone, place, height_cm, secondary_position, playing_history
  )
  VALUES (
    v_user_id, p_display_name, p_primary_position, p_photo_path, p_date_of_birth,
    p_phone, p_place, p_height_cm, p_secondary_position, p_playing_history
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    primary_position = EXCLUDED.primary_position,
    photo_path = EXCLUDED.photo_path,
    date_of_birth = EXCLUDED.date_of_birth,
    phone = EXCLUDED.phone,
    place = EXCLUDED.place,
    height_cm = EXCLUDED.height_cm,
    secondary_position = EXCLUDED.secondary_position,
    playing_history = EXCLUDED.playing_history,
    updated_at = now()
  RETURNING id INTO v_player_id;

  RETURN v_player_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_player_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_player_profile TO authenticated;

--------------------------------------------------------------------------------
-- 2. UPDATE submit_player_registration
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_player_registration(
  p_tournament_id uuid,
  p_display_name text,
  p_primary_position text,
  p_photo_path text,
  p_date_of_birth date DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_place text DEFAULT NULL,
  p_height_cm numeric DEFAULT NULL,
  p_secondary_position text DEFAULT NULL,
  p_playing_history text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_status text;
  v_reg_id uuid;
  v_player_id uuid;
  v_settings public.tournament_settings%ROWTYPE;
BEGIN
  -- 1. Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_photo_path IS NULL OR trim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'Profile photo is required';
  END IF;

  -- 2. Validate Tournament Open
  SELECT status
  INTO v_tournament_status
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_tournament_status != 'REGISTRATION' THEN
    RAISE EXCEPTION 'Tournament is not open for registration';
  END IF;

  -- 3. Enforce Settings
  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  
  IF NOT v_settings.player_registration_enabled THEN
    RAISE EXCEPTION 'Player registration is currently closed';
  END IF;

  -- 4. Create or Update Profile
  v_player_id := public.update_player_profile(
    p_display_name, p_primary_position, p_photo_path, p_date_of_birth,
    p_phone, p_place, p_height_cm, p_secondary_position, p_playing_history
  );

  -- 5. Check for existing registration
  SELECT id INTO v_reg_id
  FROM public.player_tournament_registrations
  WHERE tournament_id = p_tournament_id AND player_id = v_player_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Registration already exists';
  END IF;

  -- 6. Insert Registration securely (no injected status/classification)
  INSERT INTO public.player_tournament_registrations (
    tournament_id, player_id, status, auction_category
  )
  VALUES (
    p_tournament_id, v_player_id, 'PENDING', NULL
  )
  RETURNING id INTO v_reg_id;

  RETURN v_reg_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_player_registration FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_player_registration TO authenticated;


--------------------------------------------------------------------------------
-- 3. UPDATE submit_team_owner_application
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_team_owner_application(
  p_tournament_id uuid,
  p_proposed_team_name text,
  p_team_short_name text DEFAULT NULL,
  p_logo_path text,
  p_place text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_status text;
  v_format text;
  v_league_mode text;
  v_app_id uuid;
  v_user_id uuid := auth.uid();
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
BEGIN
  -- 1. Validate Auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_logo_path IS NULL OR trim(p_logo_path) = '' THEN
    RAISE EXCEPTION 'Team logo is required';
  END IF;

  -- 2. Validate Tournament
  SELECT status, format, league_mode
  INTO v_tournament_status, v_format, v_league_mode
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_tournament_status != 'REGISTRATION' THEN
    RAISE EXCEPTION 'Tournament is not open for registration';
  END IF;

  IF v_format != 'LEAGUE' THEN
    RAISE EXCEPTION 'Tournament format does not support teams';
  END IF;

  -- 3. Enforce Settings
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

  -- 4. Check for existing application
  SELECT id INTO v_app_id
  FROM public.team_owner_applications
  WHERE tournament_id = p_tournament_id AND user_id = v_user_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Application already exists';
  END IF;

  -- 5. Insert Application securely
  INSERT INTO public.team_owner_applications (
    tournament_id, user_id, proposed_team_name, team_short_name,
    logo_path, place, phone, email, status
  )
  VALUES (
    p_tournament_id, v_user_id, p_proposed_team_name, p_team_short_name,
    p_logo_path, p_place, p_phone, p_email, 'PENDING'
  )
  RETURNING id INTO v_app_id;

  RETURN v_app_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_team_owner_application FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_team_owner_application TO authenticated;
