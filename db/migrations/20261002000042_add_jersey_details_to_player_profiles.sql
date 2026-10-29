
-- 20261002000042_add_jersey_details_to_player_profiles.sql
-- Add jersey_name, jersey_number, and jersey_size to player_profiles and update profile/registration RPCs

ALTER TABLE public.player_profiles 
  ADD COLUMN IF NOT EXISTS jersey_name text,
  ADD COLUMN IF NOT EXISTS jersey_number text,
  ADD COLUMN IF NOT EXISTS jersey_size text CHECK (jersey_size IS NULL OR jersey_size IN ('XS','S','M','L','XL','2XL','3XL','4XL'));

-- Drop old signatures to avoid function ambiguity errors
DROP FUNCTION IF EXISTS public.update_player_profile(text, text, text, date, text, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.submit_player_registration(uuid, text, text, text, date, text, text, numeric, text, text);

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
  p_playing_history text DEFAULT NULL,
  p_jersey_name text DEFAULT NULL,
  p_jersey_number text DEFAULT NULL,
  p_jersey_size text DEFAULT NULL
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
    phone, place, height_cm, secondary_position, playing_history,
    jersey_name, jersey_number, jersey_size
  )
  VALUES (
    v_user_id, p_display_name, p_primary_position, p_photo_path, p_date_of_birth,
    p_phone, p_place, p_height_cm, p_secondary_position, p_playing_history,
    p_jersey_name, p_jersey_number, p_jersey_size
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
    jersey_name = EXCLUDED.jersey_name,
    jersey_number = EXCLUDED.jersey_number,
    jersey_size = EXCLUDED.jersey_size,
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
  p_playing_history text DEFAULT NULL,
  p_jersey_name text DEFAULT NULL,
  p_jersey_number text DEFAULT NULL,
  p_jersey_size text DEFAULT NULL
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  IF p_photo_path IS NULL OR trim(p_photo_path) = '' THEN
    RAISE EXCEPTION 'Profile photo is required';
  END IF;

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

  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  
  IF NOT v_settings.player_registration_enabled THEN
    RAISE EXCEPTION 'Player registration is currently closed';
  END IF;

  v_player_id := public.update_player_profile(
    p_display_name, p_primary_position, p_photo_path, p_date_of_birth,
    p_phone, p_place, p_height_cm, p_secondary_position, p_playing_history,
    p_jersey_name, p_jersey_number, p_jersey_size
  );

  SELECT id INTO v_reg_id
  FROM public.player_tournament_registrations
  WHERE tournament_id = p_tournament_id AND player_id = v_player_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Registration already exists';
  END IF;

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
