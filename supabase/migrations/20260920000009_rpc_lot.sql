-- 0009_rpc_lot.sql
-- RPC functions for Lot system (Draft)

--------------------------------------------------------------------------------
-- 1. SHUFFLE LOT SESSION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shuffle_lot_session(
  p_lot_session_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
  v_player_record record;
  v_lot_number integer := 1;
BEGIN
  -- 1. Validate Organizer
  SELECT tournament_id, status INTO v_tournament_id, v_status
  FROM lot_sessions
  WHERE id = p_lot_session_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot session not found';
  END IF;

  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only organizer can shuffle';
  END IF;

  IF v_status <> 'PREPARING' THEN
    RAISE EXCEPTION 'Lot session must be in PREPARING state to shuffle';
  END IF;

  -- 2. Delete any existing entries for this session (just in case)
  DELETE FROM lot_entries WHERE lot_session_id = p_lot_session_id;

  -- 3. Randomly map eligible players to lot numbers
  -- We assume players for the lot are identified by some criteria, 
  -- but for this generic function, we'll assign eligible players 
  -- based on registration category matching the lot type.
  FOR v_player_record IN (
    SELECT p.player_id 
    FROM player_tournament_registrations p
    JOIN lot_sessions ls ON ls.id = p_lot_session_id
    WHERE p.tournament_id = v_tournament_id
      AND p.status = 'APPROVED'
      AND (
        (ls.lot_type = 'ICON' AND p.auction_category = 'ICON_LOT') OR
        (ls.lot_type = 'SETTER' AND p.auction_category = 'SETTER_LOT')
      )
    ORDER BY random()
  ) LOOP
    INSERT INTO lot_entries (lot_session_id, lot_number, player_id, status)
    VALUES (p_lot_session_id, v_lot_number, v_player_record.player_id, 'AVAILABLE');
    
    v_lot_number := v_lot_number + 1;
  END LOOP;

  -- 4. Set SHUFFLED state
  UPDATE lot_sessions
  SET status = 'SHUFFLED',
      shuffled_at = now(),
      locked_at = now()
  WHERE id = p_lot_session_id;

  -- 5. Audit log
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id)
  VALUES (v_tournament_id, auth.uid(), 'SHUFFLE_LOT_SESSION', 'lot_sessions', p_lot_session_id);
END;
$$;

--------------------------------------------------------------------------------
-- 2. START LOT SESSION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_lot_session(
  p_lot_session_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
BEGIN
  -- 1. Validate Organizer & State
  SELECT tournament_id, status INTO v_tournament_id, v_status
  FROM lot_sessions
  WHERE id = p_lot_session_id FOR UPDATE;

  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status <> 'SHUFFLED' THEN
    RAISE EXCEPTION 'Session must be SHUFFLED to start';
  END IF;

  -- 2. Set LIVE
  UPDATE lot_sessions SET status = 'LIVE' WHERE id = p_lot_session_id;

  -- 3. Activate first turn
  UPDATE lot_turns
  SET status = 'ACTIVE', started_at = now()
  WHERE lot_session_id = p_lot_session_id AND turn_order = 1;

  -- 4. Audit
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id)
  VALUES (v_tournament_id, auth.uid(), 'START_LOT_SESSION', 'lot_sessions', p_lot_session_id);
END;
$$;

--------------------------------------------------------------------------------
-- 3. SELECT LOT
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.select_lot(
  p_lot_session_id uuid,
  p_lot_number integer,
  p_team_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_session_status text;
  v_lot_type text;
  v_turn_id uuid;
  v_turn_order integer;
  v_entry_id uuid;
  v_player_id uuid;
  v_entry_status text;
  v_revealed_player jsonb;
BEGIN
  -- 1. Lock session
  SELECT tournament_id, status, lot_type INTO v_tournament_id, v_session_status, v_lot_type
  FROM lot_sessions
  WHERE id = p_lot_session_id FOR UPDATE;

  IF v_session_status <> 'LIVE' THEN
    RAISE EXCEPTION 'Lot session is not LIVE';
  END IF;

  -- 2. Validate Authorization
  IF NOT (is_team_owner(p_team_id) OR is_tournament_organizer(v_tournament_id)) THEN
    RAISE EXCEPTION 'Unauthorized to select for this team';
  END IF;

  -- 3. Check Squad Size Limit
  DECLARE
    v_max_squad_size integer;
    v_current_squad_size integer;
  BEGIN
    SELECT max_squad_size INTO v_max_squad_size
    FROM tournament_settings WHERE tournament_id = v_tournament_id;

    IF v_max_squad_size IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_squad_size
      FROM team_players
      WHERE team_id = p_team_id AND status = 'ACTIVE';

      IF v_current_squad_size >= v_max_squad_size THEN
        RAISE EXCEPTION 'Maximum squad size reached';
      END IF;
    END IF;
  END;

  -- 4. Lock active turn
  SELECT id, turn_order INTO v_turn_id, v_turn_order
  FROM lot_turns
  WHERE lot_session_id = p_lot_session_id AND status = 'ACTIVE' FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active turn found';
  END IF;

  -- Check if it's actually this team's turn
  IF NOT EXISTS (
    SELECT 1 FROM lot_turns 
    WHERE id = v_turn_id AND team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'It is not this teams turn';
  END IF;

  -- 5. Lock selected lot row
  SELECT id, player_id, status INTO v_entry_id, v_player_id, v_entry_status
  FROM lot_entries
  WHERE lot_session_id = p_lot_session_id AND lot_number = p_lot_number FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot number not found';
  END IF;

  IF v_entry_status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'Lot is already selected';
  END IF;

  -- 6. Mark SELECTED
  UPDATE lot_entries
  SET status = 'SELECTED', selected_by_team_id = p_team_id, selected_at = now()
  WHERE id = v_entry_id;

  -- 7. Insert team_players
  INSERT INTO team_players (tournament_id, team_id, player_id, acquisition_type, status)
  VALUES (v_tournament_id, p_team_id, v_player_id, v_lot_type || '_LOT', 'ACTIVE');

  -- 8. Complete current turn
  UPDATE lot_turns
  SET status = 'COMPLETED', selected_entry_id = v_entry_id, completed_at = now()
  WHERE id = v_turn_id;

  -- 9. Activate next turn (if exists)
  UPDATE lot_turns
  SET status = 'ACTIVE', started_at = now()
  WHERE lot_session_id = p_lot_session_id AND turn_order = v_turn_order + 1;

  -- If no next turn, maybe auto-complete session?
  IF NOT FOUND THEN
    UPDATE lot_sessions SET status = 'COMPLETED' WHERE id = p_lot_session_id;
  END IF;

  -- 10. Audit
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id, after_json)
  VALUES (v_tournament_id, auth.uid(), 'SELECT_LOT', 'lot_entries', v_entry_id, 
          jsonb_build_object('player_id', v_player_id, 'team_id', p_team_id, 'lot_number', p_lot_number));

  -- 11. Return revealed player
  SELECT jsonb_build_object(
    'id', p.id,
    'display_name', p.display_name,
    'primary_position', p.primary_position
  ) INTO v_revealed_player
  FROM player_profiles p WHERE p.id = v_player_id;

  RETURN v_revealed_player;
END;
$$;

--------------------------------------------------------------------------------
-- 4. CANCEL LOT SESSION
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_lot_session(
  p_lot_session_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
BEGIN
  -- Validate Organizer
  SELECT tournament_id INTO v_tournament_id
  FROM lot_sessions
  WHERE id = p_lot_session_id FOR UPDATE;

  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Cancellation reason is required';
  END IF;

  -- Update state
  UPDATE lot_sessions
  SET status = 'CANCELLED',
      cancelled_by = auth.uid(),
      cancellation_reason = p_reason
  WHERE id = p_lot_session_id;

  -- Audit
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id, reason)
  VALUES (v_tournament_id, auth.uid(), 'CANCEL_LOT_SESSION', 'lot_sessions', p_lot_session_id, p_reason);
END;
$$;
