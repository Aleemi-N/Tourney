-- 20260920000017_participant_applications_and_storage.sql
-- Phase 4: Storage buckets, application RPCs, hardened approval RPCs.

--------------------------------------------------------------------------------
-- A. STORAGE BUCKETS
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('logos', 'logos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

--------------------------------------------------------------------------------
-- B. STORAGE RLS POLICIES
--------------------------------------------------------------------------------

-- avatars
CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Users can delete own avatar" ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

-- logos
CREATE POLICY "Public read logos" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Users can upload own logo" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'logos' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Users can update own logo" ON storage.objects FOR UPDATE 
USING (bucket_id = 'logos' AND auth.uid()::text = (string_to_array(name, '/'))[1]);
CREATE POLICY "Users can delete own logo" ON storage.objects FOR DELETE 
USING (bucket_id = 'logos' AND auth.uid()::text = (string_to_array(name, '/'))[1]);

--------------------------------------------------------------------------------
-- C. PLAYER RPCs
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_player_profile(
  p_display_name text,
  p_primary_position text,
  p_photo_path text DEFAULT NULL,
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

CREATE OR REPLACE FUNCTION public.submit_player_registration(
  p_tournament_id uuid,
  p_display_name text,
  p_primary_position text,
  p_photo_path text DEFAULT NULL,
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
  v_tournament_status text;
  v_registration_id uuid;
BEGIN
  -- 1. Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Validate Tournament
  SELECT status INTO v_tournament_status
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  IF v_tournament_status != 'REGISTRATION' THEN
    RAISE EXCEPTION 'Tournament is not open for registration';
  END IF;

  -- 3. Update Global Profile Safely
  v_player_id := public.update_player_profile(
    p_display_name, p_primary_position, p_photo_path, p_date_of_birth,
    p_phone, p_place, p_height_cm, p_secondary_position, p_playing_history
  );

  -- 4. Check for existing registration
  SELECT id INTO v_registration_id
  FROM public.player_tournament_registrations
  WHERE tournament_id = p_tournament_id AND player_id = v_player_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Registration already exists';
  END IF;

  -- 5. Insert Registration securely (no injected status/classification)
  INSERT INTO public.player_tournament_registrations (
    tournament_id, player_id, status, auction_category
  )
  VALUES (
    p_tournament_id, v_player_id, 'PENDING', NULL
  )
  RETURNING id INTO v_registration_id;

  RETURN v_registration_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_player_registration FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_player_registration TO authenticated;


--------------------------------------------------------------------------------
-- D. TEAM OWNER RPCs
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_team_owner_application(
  p_tournament_id uuid,
  p_proposed_team_name text,
  p_team_short_name text DEFAULT NULL,
  p_logo_path text DEFAULT NULL,
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
BEGIN
  -- 1. Validate Auth
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
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

  -- 3. Check for existing application
  SELECT id INTO v_app_id
  FROM public.team_owner_applications
  WHERE tournament_id = p_tournament_id AND user_id = v_user_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Application already exists';
  END IF;

  -- 4. Insert Application securely
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


--------------------------------------------------------------------------------
-- E. REJECTION RPCs
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_player_registration(
  p_registration_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
BEGIN
  SELECT tournament_id, status INTO v_tournament_id, v_status
  FROM public.player_tournament_registrations
  WHERE id = p_registration_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  IF NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status = 'REJECTED' THEN
    RETURN; -- Idempotent
  END IF;

  IF v_status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot reject registration in status: %', v_status;
  END IF;

  UPDATE public.player_tournament_registrations
  SET status = 'REJECTED',
      review_notes = p_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_registration_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reject_player_registration FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_player_registration TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_team_owner_application(
  p_application_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
BEGIN
  SELECT tournament_id, status INTO v_tournament_id, v_status
  FROM public.team_owner_applications
  WHERE id = p_application_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status = 'REJECTED' THEN
    RETURN; -- Idempotent
  END IF;

  IF v_status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot reject application in status: %', v_status;
  END IF;

  UPDATE public.team_owner_applications
  SET status = 'REJECTED',
      review_notes = p_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_application_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reject_team_owner_application FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_team_owner_application TO authenticated;


--------------------------------------------------------------------------------
-- F. HARDENED APPROVAL RPCs (Replaces existing in 000012)
--------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.approve_player_registration(uuid, text);

CREATE OR REPLACE FUNCTION public.approve_player_registration(
  p_registration_id uuid,
  p_auction_category text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
  v_format text;
  v_league_mode text;
BEGIN
  -- 1. Lock Registration
  SELECT r.tournament_id, r.status, t.format, t.league_mode 
  INTO v_tournament_id, v_status, v_format, v_league_mode
  FROM public.player_tournament_registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.id = p_registration_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- 2. Validate Organizer
  IF NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Idempotent Return
  IF v_status = 'APPROVED' THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot approve registration in status: %', v_status;
  END IF;

  -- 4. Validate Classification
  IF v_format = 'LEAGUE' AND v_league_mode = 'AUCTION' THEN
    IF p_auction_category IS NOT NULL AND p_auction_category NOT IN ('ICON_LOT', 'SETTER_LOT', 'MAIN_AUCTION') THEN
      RAISE EXCEPTION 'Invalid auction category';
    END IF;
  ELSE
    IF p_auction_category IS NOT NULL THEN
      RAISE EXCEPTION 'Auction category must be NULL for non-auction tournaments';
    END IF;
  END IF;

  -- 5. Update Registration
  UPDATE public.player_tournament_registrations
  SET status = 'APPROVED', 
      auction_category = p_auction_category,
      review_notes = p_notes,
      reviewed_by = auth.uid(), 
      reviewed_at = now()
  WHERE id = p_registration_id;
END;
$$;


DROP FUNCTION IF EXISTS public.approve_team_owner_application(uuid);

CREATE OR REPLACE FUNCTION public.approve_team_owner_application(
  p_application_id uuid,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_user_id uuid;
  v_team_name text;
  v_short_name text;
  v_logo_path text;
  v_place text;
  v_status text;
  v_team_id uuid;
BEGIN
  -- 1. Lock Application
  SELECT tournament_id, user_id, proposed_team_name, team_short_name, logo_path, place, status
  INTO v_tournament_id, v_user_id, v_team_name, v_short_name, v_logo_path, v_place, v_status
  FROM public.team_owner_applications
  WHERE id = p_application_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- 2. Validate Organizer
  IF NOT public.is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Idempotent Return
  IF v_status = 'APPROVED' THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('PENDING', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Cannot approve application in status: %', v_status;
  END IF;

  -- 4. Create Team (Ensure unique team name check is graceful or throws)
  INSERT INTO public.teams (tournament_id, name, short_name, logo_path, place)
  VALUES (v_tournament_id, v_team_name, v_short_name, v_logo_path, v_place)
  RETURNING id INTO v_team_id;

  -- 5. Create Team Owner
  INSERT INTO public.team_owners (team_id, user_id, is_primary)
  VALUES (v_team_id, v_user_id, true);

  -- 6. Add to tournament members
  INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id)
  VALUES (v_tournament_id, v_user_id, 'TEAM_OWNER', v_team_id)
  ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET team_id = v_team_id;

  -- 7. Update Application Status
  UPDATE public.team_owner_applications
  SET status = 'APPROVED', 
      review_notes = p_notes,
      reviewed_by = auth.uid(), 
      reviewed_at = now()
  WHERE id = p_application_id;
END;
$$;
