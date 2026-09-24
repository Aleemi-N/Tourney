import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const organizer = read('src/app/(organizer)/organizer/tournaments/[id]/lot/LotDrawClient.tsx');
const organizerPage = read('src/app/(organizer)/organizer/tournaments/[id]/lot/page.tsx');
const publicLive = read('src/app/(public)/t/[slug]/live/PublicLotLive.tsx');
const shell = read('src/components/organizer/DashboardShell.tsx');
const rules = read('src/lib/lot-draw.ts');

test('sidebar is one conditional Lot Draw item shared by desktop and mobile navigation', () => {
  assert.equal((shell.match(/name: 'Lot Draw'/g) ?? []).length, 1);
  assert.match(shell, /lotEnabledTournamentIds\.includes/);
  assert.doesNotMatch(shell, /name: 'Icon Lot'|name: 'Setter Lot'|name: 'Live'/);
});

test('all method combinations are represented by strict LOT_DRAW checks', () => {
  assert.match(rules, /iconMethod === 'LOT_DRAW'/);
  assert.match(rules, /setterMethod === 'LOT_DRAW'/);
  assert.match(rules, /format === 'LEAGUE'/);
  assert.match(rules, /leagueMode === 'AUCTION'/);
});

test('route independently validates availability and uses authoritative readiness', () => {
  assert.match(organizerPage, /isLotDrawEnabled/);
  assert.match(organizerPage, /get_tournament_phase5a_configuration/);
  assert.match(organizerPage, /not configured for this tournament/);
});

test('all lot mutations use trusted RPCs with expected turn and idempotency', () => {
  for (const rpc of ['prepare_lot_session', 'shuffle_lot_session', 'start_lot_session', 'select_lot', 'cancel_lot_session']) assert.match(organizer, new RegExp(`rpc\\('${rpc}'`));
  assert.match(organizer, /p_expected_turn_id: turn\.id/);
  assert.match(organizer, /crypto\.randomUUID/);
  assert.match(organizer, /requestKey\.current/);
});

test('client state is sanitized and never reads or mutates raw lot tables', () => {
  const clients = organizer + publicLive;
  assert.doesNotMatch(clients, /from\(['"]lot_entries['"]\)/);
  assert.doesNotMatch(clients, /from\(['"]lot_sessions['"]\)/);
  assert.doesNotMatch(clients, /from\(['"]lot_turns['"]\)/);
  assert.match(clients, /get_lot_organizer_state|get_lot_public_state/);
});

test('Realtime subscribes only to safe public events and recovers from snapshots', () => {
  for (const source of [organizer, publicLive]) {
    assert.match(source, /table: 'lot_public_events'/);
    assert.match(source, /SUBSCRIBED/);
    assert.match(source, /refresh/);
  }
  assert.match(publicLive, /setInterval/);
  assert.match(publicLive, /visibilitychange/);
  assert.match(publicLive, /window\.addEventListener\('online'/);
});

test('operation supports preparation ordering, shuffle, reveal, completion, and guarded cancellation', () => {
  assert.match(organizer, /Move .* up/);
  assert.match(organizer, /Once shuffled, the card mapping is locked/);
  assert.doesNotMatch(organizer, /Reshuffle/);
  assert.match(organizer, /AUTHORITATIVE REVEAL/);
  assert.match(organizer, /PlayerCard/);
  assert.match(organizer, /Next Turn/);
  assert.match(organizer, /selectedCount === 0/);
  assert.match(organizer, /LOT COMPLETE/);
});

test('organizer and public experiences support reduced motion and safe late join', () => {
  assert.match(organizer, /useReducedMotion/);
  assert.match(publicLive, /useReducedMotion/);
  assert.match(publicLive, /get_lot_public_state/);
  assert.match(publicLive, /Nothing is live right now/);
});
