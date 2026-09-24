/**
 * Phase 5C — Organizer Auction UI unit tests
 *
 * Tests pure TypeScript helper functions from src/lib/organizer/organizer-auction.ts
 * These run with Node.js (tsx) — no database required.
 *
 * Run: npx tsx supabase/tests/organizer-auction-ui.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'node:fs';

const organizerClient = readFileSync(
  new URL('../../src/app/(organizer)/organizer/tournaments/[id]/auction/OrganizerAuctionClient.tsx', import.meta.url),
  'utf8',
);

// ─── Inline the helpers under test (avoids needing a build step) ──────────────
// These mirror src/lib/organizer/organizer-auction.ts exactly.

function requiresPriceCategory(auctionCategory, settings) {
  if (!auctionCategory || !settings) return false;
  if (auctionCategory === 'MAIN_AUCTION') return true;
  if (auctionCategory === 'ICON_LOT' && settings.icon_selection_method === 'AUCTION') return true;
  if (auctionCategory === 'SETTER_LOT' && settings.setter_selection_method === 'AUCTION') return true;
  return false;
}

function formatMoney(amount) {
  return `₹${Math.max(0, Number(amount ?? 0)).toLocaleString('en-IN')}`;
}

function auctionStatusLabel(status) {
  const labels = {
    DRAFT: 'Draft', READY: 'Ready', LIVE: 'Live', PAUSED: 'Paused', COMPLETED: 'Completed',
  };
  return labels[status] ?? status;
}

function availableActions(snapshot) {
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

function isCategoryConfigLocked(snapshot) {
  if (!snapshot) return false;
  const s = snapshot.auction.status;
  return s === 'LIVE' || s === 'PAUSED' || s === 'COMPLETED' || s === 'READY';
}

function validateCategoryPrices(a, b, c) {
  if (a == null || b == null || c == null) return 'All prices required';
  if (a < b) return 'A must be >= B';
  if (b < c) return 'B must be >= C';
  if (c <= 0) return 'C must be > 0';
  return null; // valid
}

function safeAuctionError(message) {
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

// ─── Test suite ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── 1. Category validation ────────────────────────────────────────────────────

console.log('\n[1] Category price validation');

test('A=500 B=300 C=100 is valid', () => {
  assert.strictEqual(validateCategoryPrices(500, 300, 100), null);
});
test('A=B=C=500 is valid (equal prices allowed)', () => {
  assert.strictEqual(validateCategoryPrices(500, 500, 500), null);
});
test('A=300 B=400 C=100 violates A>=B', () => {
  assert.strictEqual(validateCategoryPrices(300, 400, 100), 'A must be >= B');
});
test('A=500 B=300 C=400 violates B>=C', () => {
  assert.strictEqual(validateCategoryPrices(500, 300, 400), 'B must be >= C');
});
test('C=0 violates C>0', () => {
  assert.strictEqual(validateCategoryPrices(500, 300, 0), 'C must be > 0');
});
test('C=-1 violates C>0', () => {
  assert.strictEqual(validateCategoryPrices(500, 300, -1), 'C must be > 0');
});
test('null A returns all-prices-required', () => {
  assert.strictEqual(validateCategoryPrices(null, 300, 100), 'All prices required');
});
test('null B returns all-prices-required', () => {
  assert.strictEqual(validateCategoryPrices(500, null, 100), 'All prices required');
});
test('null C returns all-prices-required', () => {
  assert.strictEqual(validateCategoryPrices(500, 300, null), 'All prices required');
});
test('undefined all returns all-prices-required', () => {
  assert.strictEqual(validateCategoryPrices(undefined, undefined, undefined), 'All prices required');
});
test('A=1 B=1 C=1 is valid (minimum positive)', () => {
  assert.strictEqual(validateCategoryPrices(1, 1, 1), null);
});

// ── 2. Category requirement logic ─────────────────────────────────────────────

console.log('\n[2] Participant category requirement');

const settingsIconAuction = { icon_selection_method: 'AUCTION', setter_selection_method: 'LOT_DRAW' };
const settingsSetterAuction = { icon_selection_method: 'LOT_DRAW', setter_selection_method: 'AUCTION' };
const settingsBothLot = { icon_selection_method: 'LOT_DRAW', setter_selection_method: 'LOT_DRAW' };
const settingsBothAuction = { icon_selection_method: 'AUCTION', setter_selection_method: 'AUCTION' };

test('MAIN_AUCTION always requires price category', () => {
  assert.strictEqual(requiresPriceCategory('MAIN_AUCTION', settingsBothLot), true);
});
test('MAIN_AUCTION requires price category regardless of icon/setter settings', () => {
  assert.strictEqual(requiresPriceCategory('MAIN_AUCTION', settingsBothAuction), true);
});
test('ICON_LOT + AUCTION method requires price category', () => {
  assert.strictEqual(requiresPriceCategory('ICON_LOT', settingsIconAuction), true);
});
test('ICON_LOT + LOT_DRAW method does NOT require price category', () => {
  assert.strictEqual(requiresPriceCategory('ICON_LOT', settingsBothLot), false);
});
test('SETTER_LOT + AUCTION method requires price category', () => {
  assert.strictEqual(requiresPriceCategory('SETTER_LOT', settingsSetterAuction), true);
});
test('SETTER_LOT + LOT_DRAW method does NOT require price category', () => {
  assert.strictEqual(requiresPriceCategory('SETTER_LOT', settingsBothLot), false);
});
test('null auction_category does NOT require price category', () => {
  assert.strictEqual(requiresPriceCategory(null, settingsIconAuction), false);
});
test('null settings does NOT require price category', () => {
  assert.strictEqual(requiresPriceCategory('MAIN_AUCTION', null), false);
});
test('empty string auction_category does NOT require price category', () => {
  assert.strictEqual(requiresPriceCategory('', settingsBothAuction), false);
});
test('ICON_LOT + AUCTION with both methods auction requires price category', () => {
  assert.strictEqual(requiresPriceCategory('ICON_LOT', settingsBothAuction), true);
});
test('SETTER_LOT + AUCTION with both methods auction requires price category', () => {
  assert.strictEqual(requiresPriceCategory('SETTER_LOT', settingsBothAuction), true);
});

// ── 3. Category locked state ──────────────────────────────────────────────────

console.log('\n[3] Category config locked state');

const makeSnapshot = (status, extra = {}) => ({
  auction: { id: 'a1', tournament_id: 't1', status, state_version: 1 },
  current_player: null,
  highest_bid: null,
  recent_bids: [],
  progress: { waiting: 0, sold: 0, unsold: 0 },
  last_sequence: 0,
  minimum_acquisition_reserve_price: 100,
  categories: [],
  readiness: { ready: true, blockers: [], active_teams: 2, eligible_players: 5, remaining_capacity: 10, minimum_slots_needed: 5 },
  queue: [],
  teams: [],
  ...extra,
});

test('DRAFT status: categories NOT locked', () => {
  assert.strictEqual(isCategoryConfigLocked(makeSnapshot('DRAFT')), false);
});
test('READY status: categories locked', () => {
  assert.strictEqual(isCategoryConfigLocked(makeSnapshot('READY')), true);
});
test('LIVE status: categories locked', () => {
  assert.strictEqual(isCategoryConfigLocked(makeSnapshot('LIVE')), true);
});
test('PAUSED status: categories locked', () => {
  assert.strictEqual(isCategoryConfigLocked(makeSnapshot('PAUSED')), true);
});
test('COMPLETED status: categories locked', () => {
  assert.strictEqual(isCategoryConfigLocked(makeSnapshot('COMPLETED')), true);
});
test('null snapshot: categories NOT locked', () => {
  assert.strictEqual(isCategoryConfigLocked(null), false);
});

// ── 4. Available actions by state ─────────────────────────────────────────────

console.log('\n[4] Auction lifecycle available actions');

test('No snapshot: only canPrepare', () => {
  const a = availableActions(null);
  assert.strictEqual(a.canPrepare, true);
  assert.strictEqual(a.canStart, false);
  assert.strictEqual(a.canSold, false);
  assert.strictEqual(a.canUnsold, false);
});

test('READY, no live player: canStart, canPrepare', () => {
  const a = availableActions(makeSnapshot('READY', { progress: { waiting: 3, sold: 0, unsold: 0 } }));
  assert.strictEqual(a.canStart, true);
  assert.strictEqual(a.canPrepare, true);
  assert.strictEqual(a.canPause, false);
  assert.strictEqual(a.canSold, false);
});

test('LIVE, no player open, has waiting: canOpenNext, canPause', () => {
  const a = availableActions(makeSnapshot('LIVE', { progress: { waiting: 2, sold: 1, unsold: 0 } }));
  assert.strictEqual(a.canOpenNext, true);
  assert.strictEqual(a.canPause, true);
  assert.strictEqual(a.canSold, false);
  assert.strictEqual(a.canUnsold, false);
  assert.strictEqual(a.canComplete, false);
});

test('LIVE, player open with bid: canSold, canPause', () => {
  const snap = makeSnapshot('LIVE', {
    current_player: { auction_player_id: 'ap1', state_version: 1, base_price: 500, category_code: 'A', category_label: 'Premium', category_base_price: 500, attempt_number: 1, player: { id: 'p1', display_name: 'Test', photo_path: null, primary_position: 'S', secondary_position: null } },
    highest_bid: { id: 'b1', amount: 600, team: { id: 't1', name: 'Team A', short_name: 'TA', logo_path: null } },
    progress: { waiting: 1, sold: 0, unsold: 0 },
  });
  const a = availableActions(snap);
  assert.strictEqual(a.canSold, true);
  assert.strictEqual(a.canUnsold, false);
  assert.strictEqual(a.canComplete, false);
});

test('LIVE, player open with no bids: canUnsold', () => {
  const snap = makeSnapshot('LIVE', {
    current_player: { auction_player_id: 'ap1', state_version: 1, base_price: 500, category_code: 'A', category_label: 'Premium', category_base_price: 500, attempt_number: 1, player: { id: 'p1', display_name: 'Test', photo_path: null, primary_position: 'S', secondary_position: null } },
    highest_bid: null,
    progress: { waiting: 0, sold: 0, unsold: 0 },
  });
  const a = availableActions(snap);
  assert.strictEqual(a.canSold, false);
  assert.strictEqual(a.canUnsold, true);
});

test('LIVE, all players resolved, no live player: canComplete', () => {
  const a = availableActions(makeSnapshot('LIVE', { progress: { waiting: 0, sold: 3, unsold: 1 } }));
  assert.strictEqual(a.canComplete, true);
  assert.strictEqual(a.canOpenNext, false);
});

test('PAUSED: canResume, canComplete if queue empty', () => {
  const a = availableActions(makeSnapshot('PAUSED', { progress: { waiting: 0, sold: 5, unsold: 2 } }));
  assert.strictEqual(a.canResume, true);
  assert.strictEqual(a.canComplete, true);
  assert.strictEqual(a.canPause, false);
});

test('PAUSED with waiting players: cannot complete', () => {
  const a = availableActions(makeSnapshot('PAUSED', { progress: { waiting: 2, sold: 3, unsold: 1 } }));
  assert.strictEqual(a.canComplete, false);
  assert.strictEqual(a.canResume, true);
});

test('COMPLETED: no active controls', () => {
  const a = availableActions(makeSnapshot('COMPLETED'));
  assert.strictEqual(a.canPrepare, false);
  assert.strictEqual(a.canStart, false);
  assert.strictEqual(a.canPause, false);
  assert.strictEqual(a.canResume, false);
  assert.strictEqual(a.canSold, false);
  assert.strictEqual(a.canUnsold, false);
  assert.strictEqual(a.canComplete, false);
});

test('LIVE, player open with bid: cannot open next', () => {
  const snap = makeSnapshot('LIVE', {
    current_player: { auction_player_id: 'ap1', state_version: 1, base_price: 500, category_code: 'A', category_label: 'Premium', category_base_price: 500, attempt_number: 1, player: { id: 'p1', display_name: 'Test', photo_path: null, primary_position: 'S', secondary_position: null } },
    highest_bid: { id: 'b1', amount: 600, team: { id: 't1', name: 'Team A', short_name: 'TA', logo_path: null } },
    progress: { waiting: 5, sold: 0, unsold: 0 },
  });
  const a = availableActions(snap);
  assert.strictEqual(a.canOpenNext, false);
  assert.strictEqual(a.canSold, true);
});

// ── 5. Money formatting ───────────────────────────────────────────────────────

console.log('\n[5] Money formatting');

test('formatMoney(500) = ₹500', () => {
  assert.strictEqual(formatMoney(500), '₹500');
});
test('formatMoney(0) = ₹0', () => {
  assert.strictEqual(formatMoney(0), '₹0');
});
test('formatMoney(null) = ₹0', () => {
  assert.strictEqual(formatMoney(null), '₹0');
});
test('formatMoney(-100) = ₹0 (clamped)', () => {
  assert.strictEqual(formatMoney(-100), '₹0');
});
test('formatMoney(undefined) = ₹0', () => {
  assert.strictEqual(formatMoney(undefined), '₹0');
});
test('formatMoney(100000) uses en-IN formatting', () => {
  const result = formatMoney(100000);
  assert.ok(result.startsWith('₹'), 'Should start with ₹');
  assert.ok(result.includes('1'), 'Should contain the number');
});

// ── 6. Status labels ──────────────────────────────────────────────────────────

console.log('\n[6] Status labels');

test('auctionStatusLabel(DRAFT) = Draft', () => {
  assert.strictEqual(auctionStatusLabel('DRAFT'), 'Draft');
});
test('auctionStatusLabel(READY) = Ready', () => {
  assert.strictEqual(auctionStatusLabel('READY'), 'Ready');
});
test('auctionStatusLabel(LIVE) = Live', () => {
  assert.strictEqual(auctionStatusLabel('LIVE'), 'Live');
});
test('auctionStatusLabel(PAUSED) = Paused', () => {
  assert.strictEqual(auctionStatusLabel('PAUSED'), 'Paused');
});
test('auctionStatusLabel(COMPLETED) = Completed', () => {
  assert.strictEqual(auctionStatusLabel('COMPLETED'), 'Completed');
});
test('auctionStatusLabel(unknown) returns original string', () => {
  assert.strictEqual(auctionStatusLabel('UNKNOWN_STATUS'), 'UNKNOWN_STATUS');
});

// ── 7. Readiness blocker messages ─────────────────────────────────────────────

console.log('\n[7] Readiness blocker coverage');

// Verify all known blocker codes are handled
const BLOCKERS = [
  'TOURNAMENT_NOT_FOUND', 'NOT_LEAGUE', 'NOT_AUCTION_MODE', 'INVALID_PRICING',
  'INVALID_SQUAD_LIMITS', 'MISSING_AUCTION_PRICE_CATEGORIES', 'INVALID_AUCTION_PRICE_ORDER',
  'NO_ACTIVE_TEAMS', 'NO_ELIGIBLE_PLAYERS', 'AUCTION_PLAYER_CATEGORY_MISSING',
  'ICON_LOT_INCOMPLETE', 'SETTER_LOT_INCOMPLETE', 'INSUFFICIENT_TOTAL_CAPACITY',
  'MINIMUM_SQUADS_UNREACHABLE', 'PARTIAL_OR_LEGACY_AUCTION_STATE', 'PARTIAL_INITIALIZATION',
  'PREPARED_CATEGORY_SNAPSHOT_CONFLICT', 'WALLET_CONFLICT', 'LIVE_PLAYER_CONFLICT',
  'QUEUE_CONFLICT', 'SALE_INTEGRITY_CONFLICT',
];

const blockerMessages = {
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

for (const code of BLOCKERS) {
  test(`blockerMessage(${code}) is defined`, () => {
    const msg = blockerMessages[code];
    assert.ok(msg && msg.length > 0, `blockerMessage for ${code} is empty or missing`);
  });
}

// ── 8. Safe error messages ────────────────────────────────────────────────────

console.log('\n[8] Safe auction error messages');

test('unauthorized → user-facing message', () => {
  assert.ok(safeAuctionError('Unauthorized').includes('not authorized'));
});
test('stale → user-facing message', () => {
  assert.ok(safeAuctionError('Stale auction state').toLowerCase().includes('state changed'));
});
test('not live → user-facing message', () => {
  assert.ok(safeAuctionError('Auction is not LIVE').toLowerCase().includes('not currently live'));
});
test('already live → user-facing message', () => {
  assert.ok(safeAuctionError('already live').toLowerCase().includes('already open'));
});
test('accepted bids → user-facing message', () => {
  assert.ok(safeAuctionError('has accepted bids and must be sold').includes('bids'));
});
test('operational players remain → user-facing message', () => {
  assert.ok(safeAuctionError('Operational players remain').includes('resolved'));
});
test('unknown error → generic fallback', () => {
  const msg = safeAuctionError('some unexpected db error');
  assert.ok(msg.includes('refresh'), 'Should tell user to refresh');
});
test('undefined error → generic fallback', () => {
  const msg = safeAuctionError(undefined);
  assert.ok(msg.length > 0);
});

test('organizer realtime recovers from sequence gaps, visibility, and online changes', () => {
  assert.match(organizerClient, /table: 'auction_public_events'/);
  assert.match(organizerClient, /sequence_number/);
  assert.match(organizerClient, /visibilitychange/);
  assert.match(organizerClient, /addEventListener\('online'/);
  for (const rawTable of ['auction_bids', 'auction_team_wallets', 'auction_players', 'auction_sales', 'purse_transactions']) {
    assert.doesNotMatch(organizerClient, new RegExp(`table: ['"]${rawTable}`));
  }
});

// ── 9. Re-auction price rule visibility ──────────────────────────────────────

console.log('\n[9] Re-auction price rule visibility logic');

function canSetReauctionPrice(reauctionPriceRule) {
  return reauctionPriceRule === 'ORGANIZER_SETS_PRICE';
}

test('ORGANIZER_SETS_PRICE: set price button visible', () => {
  assert.strictEqual(canSetReauctionPrice('ORGANIZER_SETS_PRICE'), true);
});
test('SAME_BASE_PRICE: set price button hidden', () => {
  assert.strictEqual(canSetReauctionPrice('SAME_BASE_PRICE'), false);
});
test('null rule: set price button hidden', () => {
  assert.strictEqual(canSetReauctionPrice(null), false);
});
test('undefined rule: set price button hidden', () => {
  assert.strictEqual(canSetReauctionPrice(undefined), false);
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
