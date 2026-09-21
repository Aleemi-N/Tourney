-- 20260920000019_tournament_registration_and_auction_settings.sql
-- Settings for Registration & Auction

--------------------------------------------------------------------------------
-- 1. ADD SETTINGS COLUMNS
--------------------------------------------------------------------------------
ALTER TABLE public.tournament_settings 
ADD COLUMN team_registration_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN auction_starting_purse numeric(12,2) DEFAULT NULL CHECK (auction_starting_purse IS NULL OR auction_starting_purse >= 0),
ADD COLUMN auction_base_price numeric(12,2) DEFAULT NULL CHECK (auction_base_price IS NULL OR auction_base_price >= 0),
ADD COLUMN auction_bid_increment numeric(12,2) DEFAULT NULL CHECK (auction_bid_increment IS NULL OR auction_bid_increment > 0);

--------------------------------------------------------------------------------
-- 2. UPDATE submit_team_owner_application
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
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
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

--------------------------------------------------------------------------------
-- 3. UPDATE submit_player_registration
--------------------------------------------------------------------------------
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
  v_tournament_status text;
  v_reg_id uuid;
  v_player_id uuid;
  v_settings public.tournament_settings%ROWTYPE;
BEGIN
  -- 1. Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
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
-- 4. UPDATE approve_team_owner_application
--------------------------------------------------------------------------------
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
  v_settings public.tournament_settings%ROWTYPE;
  v_approved_count int;
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

  -- 4. Lock Settings and enforce max_teams atomically
  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = v_tournament_id FOR UPDATE;
  
  IF v_settings.max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_approved_count FROM public.teams WHERE tournament_id = v_tournament_id;
    IF v_approved_count >= v_settings.max_teams THEN
      RAISE EXCEPTION 'Maximum team capacity has been reached';
    END IF;
  END IF;

  -- 5. Create Team (Ensure unique team name check is graceful or throws)
  INSERT INTO public.teams (tournament_id, name, short_name, logo_path, place)
  VALUES (v_tournament_id, v_team_name, v_short_name, v_logo_path, v_place)
  RETURNING id INTO v_team_id;

  -- 6. Create Team Owner
  INSERT INTO public.team_owners (team_id, user_id, is_primary)
  VALUES (v_team_id, v_user_id, true);

  -- 7. Add to tournament members
  INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id)
  VALUES (v_tournament_id, v_user_id, 'TEAM_OWNER', v_team_id)
  ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET team_id = v_team_id;

  -- 8. Update Application Status
  UPDATE public.team_owner_applications
  SET status = 'APPROVED', 
      review_notes = p_notes,
      reviewed_by = auth.uid(), 
      reviewed_at = now()
  WHERE id = p_application_id;
END;
$$;

--------------------------------------------------------------------------------
-- 5. NEW RPC: update_tournament_settings
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_tournament_settings(
  p_tournament_id uuid,
  p_player_registration_enabled boolean,
  p_team_registration_enabled boolean,
  p_max_teams integer DEFAULT NULL,
  p_max_squad_size integer DEFAULT NULL,
  p_auction_starting_purse numeric DEFAULT NULL,
  p_auction_base_price numeric DEFAULT NULL,
  p_auction_bid_increment numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_teams int;
  v_current_max_assigned int;
  v_tourn public.tournaments%ROWTYPE;
BEGIN
  -- 1. Validate Auth
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;

  -- 2. Validate Organizer
  IF NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Lock Tournament
  SELECT * INTO v_tourn FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;

  -- 4. Validate Auction Settings (Only allowed for LEAGUE + AUCTION)
  IF (p_auction_starting_purse IS NOT NULL OR p_auction_base_price IS NOT NULL OR p_auction_bid_increment IS NOT NULL) THEN
    IF NOT (v_tourn.format = 'LEAGUE' AND v_tourn.league_mode = 'AUCTION') THEN
      RAISE EXCEPTION 'Auction settings are only allowed for Auction League tournaments';
    END IF;
  END IF;

  IF p_auction_starting_purse IS NOT NULL AND p_auction_starting_purse < 0 THEN
    RAISE EXCEPTION 'Auction starting purse cannot be negative';
  END IF;
  IF p_auction_base_price IS NOT NULL AND p_auction_base_price < 0 THEN
    RAISE EXCEPTION 'Auction base price cannot be negative';
  END IF;
  IF p_auction_bid_increment IS NOT NULL AND p_auction_bid_increment <= 0 THEN
    RAISE EXCEPTION 'Auction bid increment must be greater than zero';
  END IF;

  -- 5. Validate Max Teams
  IF p_max_teams IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_teams FROM public.teams WHERE tournament_id = p_tournament_id;
    IF p_max_teams < v_current_teams THEN
      RAISE EXCEPTION 'Cannot lower max_teams below current approved team count (%)', v_current_teams;
    END IF;
  END IF;

  -- 6. Validate Max Squad Size
  IF p_max_squad_size IS NOT NULL THEN
    -- Get the maximum number of assigned players across all teams in this tournament
    SELECT COALESCE(MAX(member_count), 0) INTO v_current_max_assigned
    FROM (
      SELECT team_id, COUNT(*) as member_count
      FROM public.tournament_members
      WHERE tournament_id = p_tournament_id AND role = 'PLAYER' AND status = 'ACTIVE'
      GROUP BY team_id
    ) counts;
    
    IF p_max_squad_size < v_current_max_assigned THEN
      RAISE EXCEPTION 'Cannot lower max_squad_size below largest current team size (%)', v_current_max_assigned;
    END IF;
  END IF;

  -- 7. Update Settings
  UPDATE public.tournament_settings
  SET
    player_registration_enabled = p_player_registration_enabled,
    team_registration_enabled = p_team_registration_enabled,
    max_teams = p_max_teams,
    max_squad_size = p_max_squad_size,
    auction_starting_purse = p_auction_starting_purse,
    auction_base_price = p_auction_base_price,
    auction_bid_increment = p_auction_bid_increment,
    updated_at = now()
  WHERE tournament_id = p_tournament_id;

END;
$$;
REVOKE EXECUTE ON FUNCTION public.update_tournament_settings FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tournament_settings TO authenticated;
