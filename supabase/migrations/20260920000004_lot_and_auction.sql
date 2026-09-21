-- 0004_lot_and_auction.sql
-- Competitive Lot (Draft) and Auction systems

--------------------------------------------------------------------------------
-- 1. LOT SESSIONS
--------------------------------------------------------------------------------
CREATE TABLE public.lot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  lot_type text NOT NULL CHECK (lot_type IN ('ICON','SETTER')),
  status text NOT NULL DEFAULT 'PREPARING'
    CHECK (status IN ('PREPARING','SHUFFLED','LIVE','COMPLETED','CANCELLED')),
  shuffled_at timestamptz,
  locked_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  cancelled_by uuid REFERENCES public.profiles(id),
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 2. LOT ENTRIES
--------------------------------------------------------------------------------
CREATE TABLE public.lot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_session_id uuid NOT NULL REFERENCES public.lot_sessions(id) ON DELETE CASCADE,
  lot_number integer NOT NULL CHECK (lot_number > 0),
  player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  status text NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','SELECTED')),
  selected_by_team_id uuid REFERENCES public.teams(id),
  selected_at timestamptz,
  UNIQUE (lot_session_id, lot_number),
  UNIQUE (lot_session_id, player_id)
);

--------------------------------------------------------------------------------
-- 3. LOT TURNS
--------------------------------------------------------------------------------
CREATE TABLE public.lot_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_session_id uuid NOT NULL REFERENCES public.lot_sessions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  turn_order integer NOT NULL CHECK (turn_order > 0),
  status text NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING','ACTIVE','COMPLETED')),
  selected_entry_id uuid REFERENCES public.lot_entries(id),
  started_at timestamptz,
  completed_at timestamptz,
  UNIQUE (lot_session_id, team_id),
  UNIQUE (lot_session_id, turn_order)
);

--------------------------------------------------------------------------------
-- 4. AUCTIONS
--------------------------------------------------------------------------------
CREATE TABLE public.auctions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  starting_purse numeric(12,2) NOT NULL CHECK (starting_purse >= 0),
  minimum_bid_increment numeric(12,2) NOT NULL CHECK (minimum_bid_increment > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','READY','LIVE','PAUSED','COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id)
);

--------------------------------------------------------------------------------
-- 5. AUCTION TEAM WALLETS
--------------------------------------------------------------------------------
CREATE TABLE public.auction_team_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  starting_balance numeric(12,2) NOT NULL CHECK (starting_balance >= 0),
  spent_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (spent_amount >= 0),
  remaining_balance numeric(12,2) NOT NULL CHECK (remaining_balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, team_id)
);

--------------------------------------------------------------------------------
-- 6. AUCTION PLAYERS
--------------------------------------------------------------------------------
CREATE TABLE public.auction_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.player_profiles(id),
  base_price numeric(12,2) NOT NULL CHECK (base_price >= 0),
  auction_order integer,
  status text NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING','LIVE','SOLD','UNSOLD','WITHDRAWN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auction_id, player_id)
);

-- User invariant: At most one LIVE player per auction
CREATE UNIQUE INDEX one_live_player_per_auction
ON public.auction_players (auction_id)
WHERE status = 'LIVE';

--------------------------------------------------------------------------------
-- 7. AUCTION BIDS
--------------------------------------------------------------------------------
CREATE TABLE public.auction_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id uuid NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  auction_player_id uuid NOT NULL REFERENCES public.auction_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  source text NOT NULL CHECK (source IN ('TEAM_OWNER','ORGANIZER')),
  idempotency_key text UNIQUE,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 8. AUCTION SALES
--------------------------------------------------------------------------------
CREATE TABLE public.auction_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_player_id uuid NOT NULL UNIQUE REFERENCES public.auction_players(id),
  team_id uuid NOT NULL REFERENCES public.teams(id),
  winning_bid_id uuid NOT NULL UNIQUE REFERENCES public.auction_bids(id),
  sold_amount numeric(12,2) NOT NULL CHECK (sold_amount >= 0),
  confirmed_by uuid NOT NULL REFERENCES public.profiles(id),
  sold_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 9. PURSE TRANSACTIONS
--------------------------------------------------------------------------------
CREATE TABLE public.purse_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.auction_team_wallets(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('PURCHASE','REFUND','ADJUSTMENT')),
  amount numeric(12,2) NOT NULL,
  balance_before numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  player_id uuid REFERENCES public.player_profiles(id),
  auction_sale_id uuid REFERENCES public.auction_sales(id),
  reason text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
