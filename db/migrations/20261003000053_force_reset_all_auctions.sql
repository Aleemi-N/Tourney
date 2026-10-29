-- 20261003000053_force_reset_all_auctions.sql

DO $$
BEGIN
  -- Reset all auctions to LIVE
  UPDATE public.auctions
  SET status = 'LIVE',
      started_at = COALESCE(started_at, now()),
      paused_at = NULL;

  -- Reset all auction tournaments to LIVE
  UPDATE public.tournaments
  SET status = 'LIVE',
      updated_at = now()
  WHERE format = 'LEAGUE' AND league_mode = 'AUCTION';

  -- Delete auction sales & bids for fresh testing
  DELETE FROM public.purse_transactions WHERE transaction_type IN ('PURCHASE', 'REFUND');
  DELETE FROM public.auction_sales;
  DELETE FROM public.auction_bids;

  -- Delete team_players created by auction
  DELETE FROM public.team_players WHERE acquisition_type = 'AUCTION';

  -- Delete secondary re-auction entries (attempt_number > 1)
  DELETE FROM public.auction_players WHERE attempt_number > 1;

  -- Reset all primary auction players to WAITING
  UPDATE public.auction_players
  SET status = 'WAITING',
      live_started_at = NULL,
      terminal_at = NULL;

  -- Reset wallets to starting balance
  UPDATE public.auction_team_wallets
  SET spent_amount = 0,
      remaining_balance = starting_balance;
END;
$$;
