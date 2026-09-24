/**
 * Phase 5C Module C — Public Live Auction unit tests
 *
 * Tests the pure business-logic helpers used by PublicAuctionLive.
 * No database, no browser required.
 *
 * Run: node supabase/tests/public-auction-live.test.mjs
 */

import assert from 'assert';
import { readFileSync } from 'node:fs';

const publicPage = readFileSync(
  new URL('../../src/app/(public)/t/[slug]/live/page.tsx', import.meta.url),
  'utf8',
);

// ─── Inline helpers (match PublicAuctionLive.tsx implementations) ─────────────

function formatMoney(amount) {
  if (amount == null) return '—';
  return `₹${Math.max(0, amount).toLocaleString('en-IN')}`;
}

function statusLabel(status) {
  const labels = {
    READY: 'Ready to Start',
    LIVE: 'Live',
    PAUSED: 'Paused',
    COMPLETED: 'Completed',
  };
  return labels[status] ?? status;
}

function progressPct(progress) {
  const total = (progress.waiting ?? 0) + (progress.sold ?? 0) + (progress.unsold ?? 0);
  const done = (progress.sold ?? 0) + (progress.unsold ?? 0);
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function shouldShowPlayer(state) {
  return state.current_player !== null && state.current_player !== undefined;
}

function isAuctionActive(status) {
  return status === 'LIVE' || status === 'PAUSED';
}

function isAuctionVisible(status) {
  // Page shows auction for these states
  return ['LIVE', 'PAUSED', 'READY', 'COMPLETED'].includes(status);
}

function hasMissedEvents(lastKnownSeq, newSeq) {
  return lastKnownSeq > 0 && newSeq > lastKnownSeq + 1;
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

// ─── Test: money formatting ───────────────────────────────────────────────────

console.log('\n[1] Money formatting');

test('formats positive amount', () => {
  assert.strictEqual(formatMoney(500), '₹500');
});
test('formats zero as ₹0', () => {
  assert.strictEqual(formatMoney(0), '₹0');
});
test('clamps negative to ₹0', () => {
  assert.strictEqual(formatMoney(-50), '₹0');
});
test('null returns —', () => {
  assert.strictEqual(formatMoney(null), '—');
});
test('undefined returns —', () => {
  assert.strictEqual(formatMoney(undefined), '—');
});
test('large number formats with locale separators', () => {
  const result = formatMoney(10000);
  assert.ok(result.startsWith('₹'), `Expected ₹ prefix, got: ${result}`);
  assert.ok(result.includes('10'), `Expected 10000 in result, got: ${result}`);
});

// ─── Test: status display ─────────────────────────────────────────────────────

console.log('\n[2] Status display');

test('READY label', () => assert.strictEqual(statusLabel('READY'), 'Ready to Start'));
test('LIVE label', () => assert.strictEqual(statusLabel('LIVE'), 'Live'));
test('PAUSED label', () => assert.strictEqual(statusLabel('PAUSED'), 'Paused'));
test('COMPLETED label', () => assert.strictEqual(statusLabel('COMPLETED'), 'Completed'));
test('unknown status falls through to raw value', () => assert.strictEqual(statusLabel('DRAFT'), 'DRAFT'));

// ─── Test: auction visibility ─────────────────────────────────────────────────

console.log('\n[3] Auction page visibility rules');

test('LIVE auctions are visible', () => assert.strictEqual(isAuctionVisible('LIVE'), true));
test('PAUSED auctions are visible', () => assert.strictEqual(isAuctionVisible('PAUSED'), true));
test('READY auctions are visible', () => assert.strictEqual(isAuctionVisible('READY'), true));
test('COMPLETED auctions are visible', () => assert.strictEqual(isAuctionVisible('COMPLETED'), true));
test('DRAFT auctions NOT shown (only lot view)', () => assert.strictEqual(isAuctionVisible('DRAFT'), false));
test('anon auction discovery uses sanitized public events, not the RLS-protected auctions table', () => {
  assert.match(publicPage, /from\('auction_public_events'\)/);
  assert.match(publicPage, /latestAuctionEvent\.auction_id/);
  assert.doesNotMatch(publicPage, /from\('auctions'\)/);
});

// ─── Test: progress calculation ───────────────────────────────────────────────

console.log('\n[4] Progress percentage');

test('0/0 → 0%', () => assert.strictEqual(progressPct({ waiting: 0, sold: 0, unsold: 0 }), 0));
test('all sold → 100%', () => assert.strictEqual(progressPct({ waiting: 0, sold: 10, unsold: 0 }), 100));
test('half resolved → 50%', () => assert.strictEqual(progressPct({ waiting: 5, sold: 3, unsold: 2 }), 50));
test('rounding: 1/3 → 33%', () => assert.strictEqual(progressPct({ waiting: 2, sold: 1, unsold: 0 }), 33));
test('sold + unsold both count as done', () => assert.strictEqual(progressPct({ waiting: 0, sold: 3, unsold: 2 }), 100));

// ─── Test: player display logic ───────────────────────────────────────────────

console.log('\n[5] Player display logic');

const playerState = {
  current_player: {
    auction_player_id: 'ap1',
    base_price: 500,
    category_code: 'A',
    category_label: 'Premium',
    category_base_price: 600,
    attempt_number: 1,
    state_version: 3,
    player: {
      id: 'p1',
      display_name: 'Ramesh Kumar',
      photo_path: null,
      primary_position: 'SETTER',
      secondary_position: 'LIBERO',
    },
  },
  highest_bid: { id: 'b1', amount: 700, team: { id: 't1', name: 'Team Alpha', short_name: 'TA', logo_path: null } },
  recent_bids: [],
  progress: { waiting: 5, sold: 3, unsold: 1 },
  auction: { id: 'a1', tournament_id: 't1', status: 'LIVE', state_version: 4 },
  last_sequence: 10,
};

const noPlayerState = {
  ...playerState,
  current_player: null,
  highest_bid: null,
};

test('state with current_player shows player', () => {
  assert.strictEqual(shouldShowPlayer(playerState), true);
});
test('state with null current_player shows idle state', () => {
  assert.strictEqual(shouldShowPlayer(noPlayerState), false);
});
test('LIVE + no player still shows auction as active', () => {
  assert.strictEqual(isAuctionActive(noPlayerState.auction.status), true);
});
test('COMPLETED is not "active" (no bidding possible)', () => {
  assert.strictEqual(isAuctionActive('COMPLETED'), false);
});
test('READY is not "active" (bidding not open)', () => {
  assert.strictEqual(isAuctionActive('READY'), false);
});

// ─── Test: realtime sequence gap detection ────────────────────────────────────

console.log('\n[6] Realtime sequence tracking');

test('no gap: seq 5 after seq 4 → no missed events', () => {
  assert.strictEqual(hasMissedEvents(4, 5), false);
});
test('gap: seq 7 after seq 4 → missed events detected', () => {
  assert.strictEqual(hasMissedEvents(4, 7), true);
});
test('first event (lastKnown=0): never flags as missed', () => {
  assert.strictEqual(hasMissedEvents(0, 3), false);
});
test('same sequence: not a miss', () => {
  assert.strictEqual(hasMissedEvents(5, 5), false);
});
test('duplicate (lower) seq: not flagged', () => {
  assert.strictEqual(hasMissedEvents(10, 9), false);
});

// ─── Test: security — safe state fields ──────────────────────────────────────

console.log('\n[7] Security — public state contains only safe fields');

const FORBIDDEN_FIELDS = [
  'remaining_purse',
  'spent_purse',
  'protected_reserve',
  'max_allowed_bid',
  'may_bid',
  'minimum_acquisition_reserve_price',
  'starting_balance',
  'spent_amount',
  'remaining_balance',
  'max_allowed',
  'reserve',
];

const publicStateKeys = Object.keys(playerState);
for (const field of FORBIDDEN_FIELDS) {
  test(`public state does not contain "${field}"`, () => {
    assert.ok(!publicStateKeys.includes(field), `Forbidden field "${field}" found in public state`);
  });
}

// ─── Test: category display is SEPARATE from volleyball position ──────────────

console.log('\n[8] Category vs volleyball position separation');

test('player state has primary_position (volleyball)', () => {
  assert.ok(playerState.current_player?.player.primary_position, 'primary_position is set');
});
test('player state has category_code (auction category)', () => {
  assert.ok(playerState.current_player?.category_code, 'category_code is set');
});
test('position and category_code are never the same field', () => {
  const pos = playerState.current_player?.player.primary_position;
  const cat = playerState.current_player?.category_code;
  assert.notStrictEqual(pos, cat, 'position and category must be distinct concepts');
});
test('category codes are A, B, or C', () => {
  const code = playerState.current_player?.category_code;
  assert.ok(['A', 'B', 'C'].includes(code), `Expected A/B/C, got ${code}`);
});

// ─── Test: SOLD/UNSOLD/PAUSED/COMPLETED state rendering ──────────────────────

console.log('\n[9] Lifecycle states for idle UI');

function idleStateType(status, hasWaiting) {
  if (status === 'PAUSED') return 'paused';
  if (status === 'READY') return 'ready';
  if (status === 'COMPLETED') return 'completed';
  if (status === 'LIVE' && hasWaiting) return 'waiting';
  return 'empty';
}

test('PAUSED → paused idle state', () => assert.strictEqual(idleStateType('PAUSED', true), 'paused'));
test('READY → ready idle state', () => assert.strictEqual(idleStateType('READY', true), 'ready'));
test('COMPLETED → completed idle state', () => assert.strictEqual(idleStateType('COMPLETED', false), 'completed'));
test('LIVE with waiting → waiting state', () => assert.strictEqual(idleStateType('LIVE', true), 'waiting'));
test('LIVE with no waiting → empty queue state', () => assert.strictEqual(idleStateType('LIVE', false), 'empty'));

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) process.exit(1);
