-- 20260925000029_manual_player_assignment.sql

-- 1. Extend acquisition_type check constraint on team_players to include MANUAL_ASSIGNMENT
ALTER TABLE public.team_players
  DROP CONSTRAINT IF EXISTS team_players_acquisition_type_check;

ALTER TABLE public.team_players
  ADD CONSTRAINT team_players_acquisition_type_check
  CHECK (acquisition_type IN ('REGISTERED','ICON_LOT','SETTER_LOT','AUCTION','MANUAL','MANUAL_ASSIGNMENT'));

-- 2. Authoritative Transactional RPC for Manual Player Assignment
CREATE OR REPLACE FUNCTION public.assign_player_manually(
  p_tournament_id uuid,
  p_team_id uuid,
  p_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_team public.teams%ROWTYPE;
  v_reg public.player_tournament_registrations%ROWTYPE;
  v_settings public.tournament_settings%ROWTYPE;
  v_current_squad_count integer;
  v_max_squad integer;
  v_team_player_id uuid;
  v_auction_status text;
BEGIN
  -- 1. Validate authenticated user is organizer of this tournament
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only tournament organizers can perform manual player assignment';
  END IF;

  -- 2. Validate team belongs to tournament
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id AND tournament_id = p_tournament_id;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'Team not found or does not belong to this tournament';
  END IF;

  -- 3. Validate player registration in tournament
  SELECT * INTO v_reg FROM public.player_tournament_registrations 
  WHERE player_id = p_player_id AND tournament_id = p_tournament_id;
  
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'Player is not registered in this tournament';
  END IF;
  
  IF v_reg.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Player registration is not approved (%s)', v_reg.status;
  END IF;

  -- 4. Check maximum squad size limit
  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  v_max_squad := COALESCE(v_settings.max_squad_size, 99);

  SELECT count(*) INTO v_current_squad_count 
  FROM public.team_players 
  WHERE team_id = p_team_id AND tournament_id = p_tournament_id AND status = 'ACTIVE';

  IF v_current_squad_count >= v_max_squad THEN
    RAISE EXCEPTION 'Cannot assign player: Maximum squad size (%s) already reached', v_max_squad;
  END IF;

  -- 5. Check if player is already active on any team in this tournament
  IF EXISTS (
    SELECT 1 FROM public.team_players 
    WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Player is already assigned to a team in this tournament';
  END IF;

  -- 6. Check if player is currently LIVE in an active auction
  SELECT ap.status INTO v_auction_status
  FROM public.auction_players ap
  JOIN public.auctions a ON a.id = ap.auction_id
  WHERE a.tournament_id = p_tournament_id AND ap.player_id = p_player_id AND ap.status = 'LIVE';

  IF v_auction_status = 'LIVE' THEN
    RAISE EXCEPTION 'Player is currently LIVE in an active auction and cannot be manually assigned';
  END IF;

  -- 7. Insert squad assignment
  INSERT INTO public.team_players (
    tournament_id,
    team_id,
    player_id,
    acquisition_type,
    acquisition_amount,
    status
  ) VALUES (
    p_tournament_id,
    p_team_id,
    p_player_id,
    'MANUAL_ASSIGNMENT',
    NULL,
    'ACTIVE'
  ) RETURNING id INTO v_team_player_id;

  -- 8. Record audit log
  INSERT INTO public.audit_logs (
    tournament_id,
    user_id,
    action,
    entity_type,
    entity_id,
    after_json
  ) VALUES (
    p_tournament_id,
    auth.uid(),
    'PLAYER_MANUALLY_ASSIGNED',
    'team_players',
    v_team_player_id,
    jsonb_build_object(
      'team_id', p_team_id,
      'player_id', p_player_id,
      'acquisition_type', 'MANUAL_ASSIGNMENT',
      'price', 0,
      'squad_count_before', v_current_squad_count,
      'squad_count_after', v_current_squad_count + 1
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_player_id', v_team_player_id,
    'player_id', p_player_id,
    'team_id', p_team_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_player_manually(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_player_manually(uuid, uuid, uuid) TO authenticated;
