-- 20261003000052_reset_qa_cup_auction.sql

DO $$
DECLARE
  v_tournament_id uuid := '90200000-0000-0000-0000-000000000001';
  v_auction_id uuid;
BEGIN
  SELECT id INTO v_auction_id FROM public.auctions WHERE tournament_id = v_tournament_id;

  IF v_auction_id IS NOT NULL THEN
    -- Delete auction sales & bids
    DELETE FROM public.purse_transactions WHERE wallet_id IN (SELECT id FROM public.auction_team_wallets WHERE auction_id = v_auction_id);
    DELETE FROM public.auction_sales WHERE auction_player_id IN (SELECT id FROM public.auction_players WHERE auction_id = v_auction_id);
    DELETE FROM public.auction_bids WHERE auction_id = v_auction_id;

    -- Delete team_players that were created from auction
    DELETE FROM public.team_players WHERE tournament_id = v_tournament_id AND acquisition_type = 'AUCTION';

    -- Reset auction_players status to WAITING
    UPDATE public.auction_players 
    SET status = 'WAITING',
        live_started_at = NULL,
        terminal_at = NULL,
        attempt_number = 1
    WHERE auction_id = v_auction_id;

    -- Reset wallets
    UPDATE public.auction_team_wallets
    SET spent_amount = 0,
        remaining_balance = starting_balance,
        updated_at = now()
    WHERE auction_id = v_auction_id;

    -- Set auction status to LIVE
    UPDATE public.auctions
    SET status = 'LIVE',
        started_at = now(),
        paused_at = NULL,
        updated_at = now()
    WHERE id = v_auction_id;

    -- Set tournament status to LIVE
    UPDATE public.tournaments
    SET status = 'LIVE',
        updated_at = now()
    WHERE id = v_tournament_id;
  END IF;
END;
$$;
