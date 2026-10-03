-- 20261003000050_manual_player_assignment_with_money_and_removal.sql

-- 1. Drop existing 3-argument function to avoid signature ambiguity
DROP FUNCTION IF EXISTS public.assign_player_manually(uuid, uuid, uuid);

-- 2. Create updated assign_player_manually RPC accepting optional p_acquisition_amount
CREATE OR REPLACE FUNCTION public.assign_player_manually(
  p_tournament_id uuid,
  p_team_id uuid,
  p_player_id uuid,
  p_acquisition_amount numeric DEFAULT 0
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
  v_auction public.auctions%ROWTYPE;
  v_wallet public.auction_team_wallets%ROWTYPE;
  v_amount numeric := COALESCE(p_acquisition_amount, 0);
BEGIN
  -- 1. Validate authenticated user is organizer of this tournament
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only tournament organizers can perform manual player assignment';
  END IF;

  -- 2. Validate amount non-negative
  IF v_amount < 0 THEN
    RAISE EXCEPTION 'Acquisition amount cannot be negative';
  END IF;

  -- 3. Validate team belongs to tournament
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id AND tournament_id = p_tournament_id;
  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'Team not found or does not belong to this tournament';
  END IF;

  -- 4. Validate player registration in tournament
  SELECT * INTO v_reg FROM public.player_tournament_registrations 
  WHERE player_id = p_player_id AND tournament_id = p_tournament_id;
  
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'Player is not registered in this tournament';
  END IF;
  
  IF v_reg.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Player registration is not approved (%s)', v_reg.status;
  END IF;

  -- 5. Check maximum squad size limit
  SELECT * INTO v_settings FROM public.tournament_settings WHERE tournament_id = p_tournament_id;
  v_max_squad := COALESCE(v_settings.max_squad_size, 99);

  SELECT count(*) INTO v_current_squad_count 
  FROM public.team_players 
  WHERE team_id = p_team_id AND tournament_id = p_tournament_id AND status = 'ACTIVE';

  IF v_current_squad_count >= v_max_squad THEN
    RAISE EXCEPTION 'Cannot assign player: Maximum squad size (%s) already reached', v_max_squad;
  END IF;

  -- 6. Check if player is already active on any team in this tournament
  IF EXISTS (
    SELECT 1 FROM public.team_players 
    WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Player is already assigned to a team in this tournament';
  END IF;

  -- 7. Check if player is currently LIVE in an active auction
  SELECT ap.status INTO v_auction_status
  FROM public.auction_players ap
  JOIN public.auctions a ON a.id = ap.auction_id
  WHERE a.tournament_id = p_tournament_id AND ap.player_id = p_player_id AND ap.status = 'LIVE';

  IF v_auction_status = 'LIVE' THEN
    RAISE EXCEPTION 'Player is currently LIVE in an active auction and cannot be manually assigned';
  END IF;

  -- 8. If amount > 0, deduct from team auction purse if wallet exists
  IF v_amount > 0 THEN
    SELECT * INTO v_auction FROM public.auctions WHERE tournament_id = p_tournament_id;
    IF v_auction.id IS NOT NULL THEN
      SELECT * INTO v_wallet FROM public.auction_team_wallets 
      WHERE auction_id = v_auction.id AND team_id = p_team_id FOR UPDATE;
      
      IF v_wallet.id IS NOT NULL THEN
        IF v_wallet.remaining_balance < v_amount THEN
          RAISE EXCEPTION 'Insufficient purse balance. Team remaining balance is %', v_wallet.remaining_balance;
        END IF;

        -- Update wallet balance
        UPDATE public.auction_team_wallets
        SET spent_amount = spent_amount + v_amount,
            remaining_balance = remaining_balance - v_amount,
            updated_at = now()
        WHERE id = v_wallet.id;

        -- Record purse transaction
        INSERT INTO public.purse_transactions (
          wallet_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          player_id,
          reason,
          created_by
        ) VALUES (
          v_wallet.id,
          'PURCHASE',
          -v_amount,
          v_wallet.remaining_balance,
          v_wallet.remaining_balance - v_amount,
          p_player_id,
          'Manual Assignment Acquisition',
          auth.uid()
        );
      END IF;
    END IF;
  END IF;

  -- 9. Insert squad assignment
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
    CASE WHEN v_amount > 0 THEN v_amount ELSE NULL END,
    'ACTIVE'
  ) RETURNING id INTO v_team_player_id;

  -- 10. Record audit log
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
      'price', v_amount,
      'squad_count_before', v_current_squad_count,
      'squad_count_after', v_current_squad_count + 1
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_player_id', v_team_player_id,
    'player_id', p_player_id,
    'team_id', p_team_id,
    'acquisition_amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_player_manually(uuid, uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_player_manually(uuid, uuid, uuid, numeric) TO authenticated;

-- 3. Create remove_player_manually RPC for removing manually assigned players and refunding purse
CREATE OR REPLACE FUNCTION public.remove_player_manually(
  p_tournament_id uuid,
  p_team_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_tp public.team_players%ROWTYPE;
  v_auction public.auctions%ROWTYPE;
  v_wallet public.auction_team_wallets%ROWTYPE;
  v_refund_amount numeric := 0;
BEGIN
  -- 1. Validate authenticated user is organizer of this tournament
  IF auth.uid() IS NULL OR NOT public.is_tournament_organizer(p_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only tournament organizers can remove manually assigned players';
  END IF;

  -- 2. Validate team_player record exists and belongs to this tournament
  SELECT * INTO v_tp 
  FROM public.team_players 
  WHERE id = p_team_player_id AND tournament_id = p_tournament_id AND status = 'ACTIVE';

  IF v_tp.id IS NULL THEN
    RAISE EXCEPTION 'Assigned player record not found or not active';
  END IF;

  -- 3. Check acquisition type: only allow removing MANUAL or MANUAL_ASSIGNMENT
  IF v_tp.acquisition_type NOT IN ('MANUAL', 'MANUAL_ASSIGNMENT') THEN
    RAISE EXCEPTION 'Only manually assigned players can be removed through this action (type: %s)', v_tp.acquisition_type;
  END IF;

  -- 4. If acquisition_amount > 0, refund money to team wallet if exists
  IF v_tp.acquisition_amount IS NOT NULL AND v_tp.acquisition_amount > 0 THEN
    v_refund_amount := v_tp.acquisition_amount;
    
    SELECT * INTO v_auction FROM public.auctions WHERE tournament_id = p_tournament_id;
    IF v_auction.id IS NOT NULL THEN
      SELECT * INTO v_wallet FROM public.auction_team_wallets 
      WHERE auction_id = v_auction.id AND team_id = v_tp.team_id FOR UPDATE;

      IF v_wallet.id IS NOT NULL THEN
        -- Refund wallet balance
        UPDATE public.auction_team_wallets
        SET spent_amount = spent_amount - v_refund_amount,
            remaining_balance = remaining_balance + v_refund_amount,
            updated_at = now()
        WHERE id = v_wallet.id;

        -- Record refund purse transaction
        INSERT INTO public.purse_transactions (
          wallet_id,
          transaction_type,
          amount,
          balance_before,
          balance_after,
          player_id,
          reason,
          created_by
        ) VALUES (
          v_wallet.id,
          'REFUND',
          v_refund_amount,
          v_wallet.remaining_balance,
          v_wallet.remaining_balance + v_refund_amount,
          v_tp.player_id,
          'Manual Assignment Player Removal Refund',
          auth.uid()
        );
      END IF;
    END IF;
  END IF;

  -- 5. Delete team_player record
  DELETE FROM public.team_players WHERE id = p_team_player_id;

  -- 6. Audit log entry
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
    'PLAYER_MANUALLY_REMOVED',
    'team_players',
    p_team_player_id,
    jsonb_build_object(
      'team_id', v_tp.team_id,
      'player_id', v_tp.player_id,
      'refunded_amount', v_refund_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'team_player_id', p_team_player_id,
    'player_id', v_tp.player_id,
    'team_id', v_tp.team_id,
    'refunded_amount', v_refund_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_player_manually(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_player_manually(uuid, uuid) TO authenticated;
