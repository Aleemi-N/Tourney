-- 0010_rpc_auction.sql
-- RPC functions for Auction system

--------------------------------------------------------------------------------
-- 1. PLACE AUCTION BID
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_auction_bid(
  p_auction_id uuid,
  p_auction_player_id uuid,
  p_team_id uuid,
  p_amount numeric,
  p_idempotency_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_auction_status text;
  v_player_status text;
  v_wallet_balance numeric;
  v_highest_bid numeric;
  v_base_price numeric;
  v_min_increment numeric;
  v_is_organizer boolean;
  v_is_owner boolean;
  v_source text;
BEGIN
  -- 1. Authenticate & Resolve Roles
  v_is_organizer := is_tournament_organizer((SELECT tournament_id FROM auctions WHERE id = p_auction_id));
  v_is_owner := is_team_owner(p_team_id);
  
  IF v_is_organizer THEN
    v_source := 'ORGANIZER';
  ELSIF v_is_owner THEN
    v_source := 'TEAM_OWNER';
  ELSE
    RAISE EXCEPTION 'Unauthorized to place bid for this team';
  END IF;

  -- 2. Lock Auction and Player
  SELECT tournament_id, status, minimum_bid_increment 
  INTO v_tournament_id, v_auction_status, v_min_increment
  FROM auctions WHERE id = p_auction_id FOR UPDATE;

  IF v_auction_status <> 'LIVE' THEN
    RAISE EXCEPTION 'Auction is not LIVE';
  END IF;

  SELECT status, base_price INTO v_player_status, v_base_price
  FROM auction_players WHERE id = p_auction_player_id AND auction_id = p_auction_id FOR UPDATE;

  IF v_player_status <> 'LIVE' THEN
    RAISE EXCEPTION 'Player is not currently LIVE for bidding';
  END IF;

  -- 3. Determine required next bid
  SELECT COALESCE(MAX(amount), 0) INTO v_highest_bid
  FROM auction_bids WHERE auction_player_id = p_auction_player_id;

  IF v_highest_bid = 0 THEN
    IF p_amount < v_base_price THEN
      RAISE EXCEPTION 'First bid must be at least the base price (%)', v_base_price;
    END IF;
  ELSE
    IF p_amount < (v_highest_bid + v_min_increment) THEN
      RAISE EXCEPTION 'Bid must be at least % higher than current highest bid (%)', v_min_increment, v_highest_bid;
    END IF;
  END IF;

  -- 4. Lock wallet & Validate purse
  SELECT remaining_balance INTO v_wallet_balance
  FROM auction_team_wallets WHERE auction_id = p_auction_id AND team_id = p_team_id FOR UPDATE;

  IF p_amount > v_wallet_balance THEN
    RAISE EXCEPTION 'Insufficient purse balance';
  END IF;

  -- 5. Insert Bid
  INSERT INTO auction_bids (auction_id, auction_player_id, team_id, amount, source, idempotency_key, submitted_by)
  VALUES (p_auction_id, p_auction_player_id, p_team_id, p_amount, v_source, p_idempotency_key, auth.uid());
END;
$$;

--------------------------------------------------------------------------------
-- 2. FINALIZE AUCTION SALE
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_auction_sale(
  p_auction_id uuid,
  p_auction_player_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_player_status text;
  v_profile_id uuid;
  v_winning_bid_id uuid;
  v_winning_team_id uuid;
  v_winning_amount numeric;
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_sale_id uuid;
BEGIN
  -- 1. Organizer authorization
  SELECT tournament_id INTO v_tournament_id FROM auctions WHERE id = p_auction_id;
  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. Lock auction player
  SELECT status, player_id INTO v_player_status, v_profile_id
  FROM auction_players WHERE id = p_auction_player_id AND auction_id = p_auction_id FOR UPDATE;

  IF v_player_status <> 'LIVE' THEN
    RAISE EXCEPTION 'Player is not LIVE (may already be sold/unsold)';
  END IF;

  -- 3. Lock latest accepted bid
  SELECT id, team_id, amount INTO v_winning_bid_id, v_winning_team_id, v_winning_amount
  FROM auction_bids 
  WHERE auction_player_id = p_auction_player_id
  ORDER BY amount DESC, created_at ASC
  LIMIT 1 FOR UPDATE;

  IF v_winning_bid_id IS NULL THEN
    RAISE EXCEPTION 'Cannot finalize sale with no bids. Mark unsold instead.';
  END IF;

  -- 4. Lock wallet and verify purse
  SELECT id, remaining_balance INTO v_wallet_id, v_wallet_balance
  FROM auction_team_wallets WHERE auction_id = p_auction_id AND team_id = v_winning_team_id FOR UPDATE;

  IF v_winning_amount > v_wallet_balance THEN
    RAISE EXCEPTION 'Winning team has insufficient purse balance';
  END IF;

  -- 4b. Verify max squad size
  DECLARE
    v_max_squad_size integer;
    v_current_squad_size integer;
  BEGIN
    SELECT max_squad_size INTO v_max_squad_size
    FROM tournament_settings WHERE tournament_id = v_tournament_id;

    IF v_max_squad_size IS NOT NULL THEN
      SELECT COUNT(*) INTO v_current_squad_size
      FROM team_players
      WHERE team_id = v_winning_team_id AND status = 'ACTIVE';

      IF v_current_squad_size >= v_max_squad_size THEN
        RAISE EXCEPTION 'Maximum squad size reached for the winning team';
      END IF;
    END IF;
  END;

  -- 5. Create Sale
  INSERT INTO auction_sales (auction_player_id, team_id, winning_bid_id, sold_amount, confirmed_by)
  VALUES (p_auction_player_id, v_winning_team_id, v_winning_bid_id, v_winning_amount, auth.uid())
  RETURNING id INTO v_sale_id;

  -- 6. Create Team Player
  INSERT INTO team_players (tournament_id, team_id, player_id, acquisition_type, acquisition_amount, status)
  VALUES (v_tournament_id, v_winning_team_id, v_profile_id, 'AUCTION', v_winning_amount, 'ACTIVE');

  -- 7. Purse Ledger & Wallet Update
  INSERT INTO purse_transactions (wallet_id, transaction_type, amount, balance_before, balance_after, player_id, auction_sale_id, created_by)
  VALUES (v_wallet_id, 'PURCHASE', -v_winning_amount, v_wallet_balance, v_wallet_balance - v_winning_amount, v_profile_id, v_sale_id, auth.uid());

  UPDATE auction_team_wallets
  SET remaining_balance = remaining_balance - v_winning_amount,
      spent_amount = spent_amount + v_winning_amount,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- 8. Mark Player SOLD
  UPDATE auction_players SET status = 'SOLD' WHERE id = p_auction_player_id;

  -- 9. Audit
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id, after_json)
  VALUES (v_tournament_id, auth.uid(), 'FINALIZE_AUCTION_SALE', 'auction_sales', v_sale_id, 
          jsonb_build_object('player_id', v_profile_id, 'team_id', v_winning_team_id, 'amount', v_winning_amount));

  RETURN jsonb_build_object('sale_id', v_sale_id, 'team_id', v_winning_team_id, 'amount', v_winning_amount);
END;
$$;

--------------------------------------------------------------------------------
-- 3. MARK AUCTION PLAYER UNSOLD
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_auction_player_unsold(
  p_auction_id uuid,
  p_auction_player_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_player_status text;
BEGIN
  -- Organizer authorization
  SELECT tournament_id INTO v_tournament_id FROM auctions WHERE id = p_auction_id;
  IF NOT is_tournament_organizer(v_tournament_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock player
  SELECT status INTO v_player_status
  FROM auction_players WHERE id = p_auction_player_id AND auction_id = p_auction_id FOR UPDATE;

  IF v_player_status <> 'LIVE' THEN
    RAISE EXCEPTION 'Player is not LIVE';
  END IF;

  -- Mark UNSOLD
  UPDATE auction_players SET status = 'UNSOLD' WHERE id = p_auction_player_id;

  -- Audit
  INSERT INTO audit_logs (tournament_id, user_id, action, entity_type, entity_id)
  VALUES (v_tournament_id, auth.uid(), 'MARK_PLAYER_UNSOLD', 'auction_players', p_auction_player_id);
END;
$$;
