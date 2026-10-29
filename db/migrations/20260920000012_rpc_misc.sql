-- 0012_rpc_misc.sql
-- RPC functions for Approvals

--------------------------------------------------------------------------------
-- 1. APPROVE TEAM OWNER APPLICATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_team_owner_application(
  p_application_id uuid
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
  FROM team_owner_applications
  WHERE id = p_application_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- 2. Validate Organizer
  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Application is already approved';
  END IF;

  -- 3. Create Team
  INSERT INTO teams (tournament_id, name, short_name, logo_path, place)
  VALUES (v_tournament_id, v_team_name, v_short_name, v_logo_path, v_place)
  RETURNING id INTO v_team_id;

  -- 4. Create Team Owner
  INSERT INTO team_owners (team_id, user_id, is_primary)
  VALUES (v_team_id, v_user_id, true);

  -- 5. Add to tournament members
  INSERT INTO tournament_members (tournament_id, user_id, role, team_id)
  VALUES (v_tournament_id, v_user_id, 'TEAM_OWNER', v_team_id)
  ON CONFLICT (tournament_id, user_id, role) DO UPDATE SET team_id = v_team_id;

  -- 6. Update Application Status
  UPDATE team_owner_applications
  SET status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_application_id;
END;
$$;

--------------------------------------------------------------------------------
-- 2. APPROVE PLAYER REGISTRATION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_player_registration(
  p_registration_id uuid,
  p_auction_category text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
BEGIN
  -- 1. Lock Registration
  SELECT tournament_id, status INTO v_tournament_id, v_status
  FROM player_tournament_registrations
  WHERE id = p_registration_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  -- 2. Validate Organizer
  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 3. Update Registration
  UPDATE player_tournament_registrations
  SET status = 'APPROVED', 
      auction_category = p_auction_category,
      reviewed_by = auth.uid(), 
      reviewed_at = now()
  WHERE id = p_registration_id;
END;
$$;
