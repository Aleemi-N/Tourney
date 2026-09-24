/**
 * Organizer-side auction types and helpers.
 *
 * Mirrors the shape returned by:
 *   get_auction_organizer_state(p_auction_id)
 *   get_auction_readiness(p_tournament_id)
 *   update_auction_price_categories(...)
 *   prepare_auction(...)
 *   set_auction_lifecycle(...)
 *   open_next_auction_player(...)
 *   finalize_auction_sale(...)
 *   mark_auction_player_unsold(...)
 *   set_reauction_price(...)
 *   requeue_auction_player(...)
 *   complete_auction(...)
 *
 * NEVER expose raw financial write paths from the browser — always go through RPCs.
 */

// ─── Category ────────────────────────────────────────────────────────────────

export type AuctionCategoryCode = 'A' | 'B' | 'C';

export interface AuctionCategory {
  id: string;
  code: AuctionCategoryCode;
  display_name: string;
  base_price: number;
  display_order: number;
}

// ─── Auction core ─────────────────────────────────────────────────────────────

export type AuctionStatus = 'DRAFT' | 'READY' | 'LIVE' | 'PAUSED' | 'COMPLETED';

export interface AuctionInfo {
  id: string;
  tournament_id: string;
  status: AuctionStatus;
  state_version: number;
}

// ─── Player in the queue ──────────────────────────────────────────────────────

export type AuctionPlayerStatus = 'WAITING' | 'LIVE' | 'SOLD' | 'UNSOLD';

export interface QueuePlayer {
  auction_player_id: string;
  player_id: string;
  /** Enriched client-side after page load — not in RPC response */
  player_display_name?: string;
  status: AuctionPlayerStatus;
  base_price: number;
  category_code: AuctionCategoryCode | null;
  category_label: string | null;
  category_base_price: number | null;
  attempt_number: number;
  auction_order: number;
  state_version: number;
}

// ─── Current live player ──────────────────────────────────────────────────────

export interface LivePlayerInfo {
  auction_player_id: string;
  base_price: number;
  category_code: AuctionCategoryCode | null;
  category_label: string | null;
  category_base_price: number | null;
  attempt_number: number;
  state_version: number;
  player: {
    id: string;
    display_name: string;
    photo_path: string | null;
    primary_position: string | null;
    secondary_position: string | null;
  };
}

// ─── Bid ──────────────────────────────────────────────────────────────────────

export interface BidInfo {
  id: string;
  amount: number;
  team: {
    id: string;
    name: string;
    short_name: string | null;
    logo_path: string | null;
  };
}

// ─── Team wallet (organizer-visible) ─────────────────────────────────────────

export interface OrganizerTeamWallet {
  team_id: string;
  /** Enriched client-side after page load — not in RPC response */
  team_name?: string;
  /** Enriched client-side after page load — not in RPC response */
  team_short_name?: string | null;
  starting_purse: number;
  spent: number;
  remaining: number;
  finance: {
    remaining: number;
    spent: number;
    active_squad: number;
    minimum_squad: number;
    maximum_squad: number;
    reserve: number;
    max_allowed_bid: number;
  };
}

// ─── Progress counters ────────────────────────────────────────────────────────

export interface AuctionProgress {
  waiting: number;
  sold: number;
  unsold: number;
}

// ─── Readiness ────────────────────────────────────────────────────────────────

export type ReadinessBlocker =
  | 'TOURNAMENT_NOT_FOUND'
  | 'NOT_LEAGUE'
  | 'NOT_AUCTION_MODE'
  | 'INVALID_PRICING'
  | 'INVALID_SQUAD_LIMITS'
  | 'MISSING_AUCTION_PRICE_CATEGORIES'
  | 'INVALID_AUCTION_PRICE_ORDER'
  | 'NO_ACTIVE_TEAMS'
  | 'NO_ELIGIBLE_PLAYERS'
  | 'AUCTION_PLAYER_CATEGORY_MISSING'
  | 'ICON_LOT_INCOMPLETE'
  | 'SETTER_LOT_INCOMPLETE'
  | 'INSUFFICIENT_TOTAL_CAPACITY'
  | 'MINIMUM_SQUADS_UNREACHABLE'
  | 'PARTIAL_OR_LEGACY_AUCTION_STATE'
  | 'PARTIAL_INITIALIZATION'
  | 'PREPARED_CATEGORY_SNAPSHOT_CONFLICT'
  | 'WALLET_CONFLICT'
  | 'LIVE_PLAYER_CONFLICT'
  | 'QUEUE_CONFLICT'
  | 'SALE_INTEGRITY_CONFLICT';

export interface ReadinessResult {
  ready: boolean;
  blockers: ReadinessBlocker[];
  active_teams: number;
  eligible_players: number;
  remaining_capacity: number;
  minimum_slots_needed: number;
}

// ─── Full organizer snapshot ──────────────────────────────────────────────────

export interface OrganizerAuctionSnapshot {
  auction: AuctionInfo;
  current_player: LivePlayerInfo | null;
  highest_bid: BidInfo | null;
  recent_bids: BidInfo[];
  progress: AuctionProgress;
  last_sequence: number;
  minimum_acquisition_reserve_price: number;
  categories: AuctionCategory[];
  readiness: ReadinessResult;
  queue: QueuePlayer[];
  teams: OrganizerTeamWallet[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatMoney(amount: number | null | undefined): string {
  return `₹${Math.max(0, Number(amount ?? 0)).toLocaleString('en-IN')}`;
}

/**
 * Validate A ≥ B ≥ C > 0.
 * Returns null if valid, an error string otherwise.
 */
export function validateCategoryPrices(
  a: number | null | undefined,
  b: number | null | undefined,
  c: number | null | undefined
): string | null {
  if (a == null || b == null || c == null) return 'All prices required';
  if (a < b) return 'A must be >= B';
  if (b < c) return 'B must be >= C';
  if (c <= 0) return 'C must be > 0';
  return null;
}

/**
 * Returns true when an approved player in the given auction_category requires
 * an A/B/C price category, given the current tournament settings.
 */
export function requiresPriceCategory(
  auctionCategory: string | null | undefined,
  settings: { icon_selection_method?: string; setter_selection_method?: string } | null
): boolean {
  if (!auctionCategory || !settings) return false;
  if (auctionCategory === 'MAIN_AUCTION') return true;
  if (auctionCategory === 'ICON_LOT' && settings.icon_selection_method === 'AUCTION') return true;
  if (auctionCategory === 'SETTER_LOT' && settings.setter_selection_method === 'AUCTION') return true;
  return false;
}

export function auctionStatusLabel(status: AuctionStatus): string {
  const labels: Record<AuctionStatus, string> = {
    DRAFT: 'Draft',
    READY: 'Ready',
    LIVE: 'Live',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
  };
  return labels[status] ?? status;
}

export function blockerMessage(blocker: ReadinessBlocker): string {
  const messages: Record<ReadinessBlocker, string> = {
    TOURNAMENT_NOT_FOUND: 'Tournament not found.',
    NOT_LEAGUE: 'Tournament must be a League format.',
    NOT_AUCTION_MODE: 'Tournament must be in Auction mode.',
    INVALID_PRICING: 'Auction pricing (purse, base price, bid increment) is incomplete or zero.',
    INVALID_SQUAD_LIMITS: 'Squad size limits are not configured or invalid.',
    MISSING_AUCTION_PRICE_CATEGORIES: 'All three auction price categories (A, B, C) must be configured.',
    INVALID_AUCTION_PRICE_ORDER: 'Category prices must satisfy A ≥ B ≥ C > 0.',
    NO_ACTIVE_TEAMS: 'There are no active teams in this tournament.',
    NO_ELIGIBLE_PLAYERS: 'There are no eligible players ready for the auction.',
    AUCTION_PLAYER_CATEGORY_MISSING: 'One or more approved auction-routed players are missing their A/B/C price category.',
    ICON_LOT_INCOMPLETE: 'The Icon Lot Draw must be completed before the auction can start.',
    SETTER_LOT_INCOMPLETE: 'The Setter Lot Draw must be completed before the auction can start.',
    INSUFFICIENT_TOTAL_CAPACITY: 'There are more eligible players than available squad slots across all teams.',
    MINIMUM_SQUADS_UNREACHABLE: 'There are not enough eligible players to fill the minimum squad requirement for all teams.',
    PARTIAL_OR_LEGACY_AUCTION_STATE: 'A partial or legacy auction state exists. This requires preflight resolution.',
    PARTIAL_INITIALIZATION: 'Auction is prepared but team wallets do not match the current team count.',
    PREPARED_CATEGORY_SNAPSHOT_CONFLICT: 'Price category configuration changed after auction preparation. Re-preparation is required.',
    WALLET_CONFLICT: 'A team wallet balance is inconsistent.',
    LIVE_PLAYER_CONFLICT: 'More than one player is marked LIVE simultaneously.',
    QUEUE_CONFLICT: 'Duplicate entries detected in the auction queue.',
    SALE_INTEGRITY_CONFLICT: 'A sale record is inconsistent with the winning bid.',
  };
  return messages[blocker] ?? blocker;
}

/** Safe RPC error to user-facing message. */
export function safeAuctionError(message?: string): string {
  const v = message?.toLowerCase() ?? '';
  if (v.includes('unauthorized')) return 'You are not authorized to perform this action.';
  if (v.includes('stale')) return 'The auction state changed. The screen has been refreshed.';
  if (v.includes('not live')) return 'The auction is not currently live.';
  if (v.includes('already live')) return 'A player is already open for bidding.';
  if (v.includes('winning bid is stale')) return 'The winning bid changed. Please refresh and confirm.';
  if (v.includes('accepted bids')) return 'This player received bids and cannot be marked unsold.';
  if (v.includes('operational players remain')) return 'All players must be resolved (sold or unsold) before completing the auction.';
  if (v.includes('request key')) return 'This request was already submitted.';
  if (v.includes('readiness')) return 'Auction readiness conditions changed. Please review blockers.';
  return 'The operation could not be completed. Please refresh and try again.';
}

/** Returns which actions are available given the current auction and player state. */
export function availableActions(snapshot: OrganizerAuctionSnapshot | null): {
  canPrepare: boolean;
  canStart: boolean;
  canPause: boolean;
  canResume: boolean;
  canOpenNext: boolean;
  canSold: boolean;
  canUnsold: boolean;
  canComplete: boolean;
} {
  if (!snapshot) {
    return { canPrepare: true, canStart: false, canPause: false, canResume: false, canOpenNext: false, canSold: false, canUnsold: false, canComplete: false };
  }
  const s = snapshot.auction.status;
  const hasLive = snapshot.current_player !== null;
  const hasWaiting = snapshot.progress.waiting > 0;
  const hasBid = snapshot.highest_bid !== null;

  return {
    canPrepare: s === 'DRAFT' || s === 'READY',
    canStart: s === 'READY' && !hasLive,
    canPause: s === 'LIVE',
    canResume: s === 'PAUSED',
    canOpenNext: s === 'LIVE' && !hasLive && hasWaiting,
    canSold: s === 'LIVE' && hasLive && hasBid,
    canUnsold: s === 'LIVE' && hasLive && !hasBid,
    canComplete: (s === 'LIVE' || s === 'PAUSED') && !hasWaiting && !hasLive,
  };
}

/** Determine if auction category config should be locked (auction prepared or players loaded). */
export function isCategoryConfigLocked(snapshot: OrganizerAuctionSnapshot | null): boolean {
  if (!snapshot) return false;
  const s = snapshot.auction.status;
  return s === 'LIVE' || s === 'PAUSED' || s === 'COMPLETED' || s === 'READY';
}
