// Organizer auction types and messages, the same as the website's lib/organizer/organizer-auction.ts.
export type AuctionStatus = 'DRAFT' | 'READY' | 'LIVE' | 'PAUSED' | 'COMPLETED';
export type QueuePlayer = { auction_player_id: string; player_id: string; player_display_name?: string; status: string; base_price: number; category_code: string | null; attempt_number: number; auction_order: number; state_version: number };
export type LivePlayer = { auction_player_id: string; base_price: number; category_code: string | null; category_label: string | null; attempt_number: number; state_version: number; player: { id: string; display_name: string; primary_position: string | null; secondary_position: string | null } };
export type Bid = { id: string; amount: number; team: { id: string; name: string; short_name: string | null } };
export type Wallet = { team_id: string; finance: { remaining: number; spent: number; active_squad: number; minimum_squad: number; maximum_squad: number; reserve: number; max_allowed_bid: number } };
export type Readiness = { ready: boolean; blockers: string[]; active_teams: number; eligible_players: number; remaining_capacity: number; minimum_slots_needed: number };
export type Snapshot = {
  auction: { id: string; tournament_id: string; status: AuctionStatus; state_version: number };
  current_player: LivePlayer | null; highest_bid: Bid | null; recent_bids: Bid[]; progress: { waiting: number; sold: number; unsold: number };
  last_sequence: number; readiness: Readiness; queue: QueuePlayer[]; teams: Wallet[];
};

export const money = (n: number | null | undefined) => `₹${Math.max(0, Number(n ?? 0)).toLocaleString('en-IN')}`;

const BLOCKERS: Record<string, string> = {
  TOURNAMENT_NOT_FOUND: 'Tournament not found.', NOT_LEAGUE: 'Tournament must be a League format.', NOT_AUCTION_MODE: 'Tournament must be in Auction mode.',
  INVALID_PRICING: 'Auction pricing (purse, base price, bid increment) is incomplete or zero.', INVALID_SQUAD_LIMITS: 'Squad size limits are not configured or invalid.',
  MISSING_AUCTION_PRICE_CATEGORIES: 'All three auction price categories (A, B, C) must be configured.', INVALID_AUCTION_PRICE_ORDER: 'Category prices must satisfy A ≥ B ≥ C > 0.',
  NO_ACTIVE_TEAMS: 'There are no active teams in this tournament.', NO_ELIGIBLE_PLAYERS: 'There are no eligible players ready for the auction.',
  AUCTION_PLAYER_CATEGORY_MISSING: 'One or more approved auction-routed players are missing their A/B/C price category.',
  ICON_LOT_INCOMPLETE: 'The Icon Lot Draw must be completed before the auction can start.', SETTER_LOT_INCOMPLETE: 'The Setter Lot Draw must be completed before the auction can start.',
  INSUFFICIENT_TOTAL_CAPACITY: 'There are more eligible players than available squad slots across all teams.', MINIMUM_SQUADS_UNREACHABLE: 'There are not enough eligible players to fill the minimum squad requirement for all teams.',
  PARTIAL_OR_LEGACY_AUCTION_STATE: 'A partial or legacy auction state exists. This requires preflight resolution.', PARTIAL_INITIALIZATION: 'Auction is prepared but team wallets do not match the current team count.',
  PREPARED_CATEGORY_SNAPSHOT_CONFLICT: 'Price category configuration changed after auction preparation. Re-preparation is required.', WALLET_CONFLICT: 'A team wallet balance is inconsistent.',
  LIVE_PLAYER_CONFLICT: 'More than one player is marked LIVE simultaneously.', QUEUE_CONFLICT: 'Duplicate entries detected in the auction queue.', SALE_INTEGRITY_CONFLICT: 'A sale record is inconsistent with the winning bid.',
};
export const blockerMessage = (b: string) => BLOCKERS[b] ?? b;

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

/** Which controls are available for the current auction and player. */
export function availableActions(s: Snapshot | null) {
  if (!s) return { canPrepare: true, canStart: false, canPause: false, canResume: false, canOpenNext: false, canSold: false, canUnsold: false, canComplete: false };
  const status = s.auction.status;
  const hasLive = s.current_player !== null;
  return {
    canPrepare: status === 'DRAFT' || status === 'READY',
    canStart: status === 'READY' && !hasLive,
    canPause: status === 'LIVE',
    canResume: status === 'PAUSED',
    canOpenNext: status === 'LIVE' && !hasLive && s.progress.waiting > 0,
    canSold: status === 'LIVE' && hasLive && s.highest_bid !== null,
    canUnsold: status === 'LIVE' && hasLive && s.highest_bid === null,
    canComplete: (status === 'LIVE' || status === 'PAUSED') && !hasLive && s.progress.waiting === 0,
  };
}
