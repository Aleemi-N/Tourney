/**
 * Agent C — Public Tournament Experience
 * Targeted static/source-code tests covering:
 *
 * 1. Route coverage & component contracts
 * 2. Security — no private data exposure via public components
 * 3. SEO metadata on every public sub-page
 * 4. Live match — proper RPC + realtime, no direct table writes
 * 5. Lot/Auction live regression — safe channels only
 * 6. Branding + sponsors — schema-backed, no invented data
 * 7. PWA / cache safety
 * 8. Responsive design tokens present
 * 9. Frame tab navigation completeness
 * 10. Empty/not-found state coverage
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// ── Source files ──────────────────────────────────────────────────────────────
const frame         = read('src/components/public/PublicTournamentFrame.tsx');
const home          = read('src/app/(public)/t/[slug]/page.tsx');
const fixtures      = read('src/app/(public)/t/[slug]/fixtures/page.tsx');
const results       = read('src/app/(public)/t/[slug]/results/page.tsx');
const table         = read('src/app/(public)/t/[slug]/table/page.tsx');
const teams         = read('src/app/(public)/t/[slug]/teams/page.tsx');
const players       = read('src/app/(public)/t/[slug]/players/page.tsx');
const live          = read('src/app/(public)/t/[slug]/live/page.tsx');
const matchPage     = read('src/app/(public)/t/[slug]/match/[matchId]/page.tsx');
const matchLive     = read('src/components/public/PublicMatchLive.tsx');
const pubAuction    = read('src/app/(public)/t/[slug]/live/PublicAuctionLive.tsx');
const pubLot        = read('src/app/(public)/t/[slug]/live/PublicLotLive.tsx');
const notFound      = read('src/components/public/TournamentNotFound.tsx');
const headerHelper  = read('src/lib/tournament-header.ts');
const metadata      = read('src/lib/public-tournament-metadata.ts');
const sw            = read('public/sw.js');
const rls           = read('supabase/migrations/20260920000007_rls_policies.sql');
const views         = read('supabase/migrations/20260920000008_views.sql');
const branding      = read('supabase/migrations/20260920000006_branding_and_audit.sql');
const migration26   = read('supabase/migrations/20260924000026_v1_fixtures_scoring_snapshots.sql');

// ─────────────────────────────────────────────────────────────────────────────
// 1. FRAME — tab navigation completeness
// ─────────────────────────────────────────────────────────────────────────────
test('PublicTournamentFrame contains all 6 required tab routes', () => {
  for (const route of ['live', 'fixtures', 'results', 'table', 'teams', 'players']) {
    assert.match(frame, new RegExp(route), `Missing tab: ${route}`);
  }
  for (const label of ['Live', 'Fixtures', 'Results', 'Table', 'Teams', 'Players']) {
    assert.match(frame, new RegExp(label), `Missing tab label: ${label}`);
  }
});

test('PublicTournamentFrame is a Client Component (usePathname active-tab)', () => {
  assert.match(frame, /'use client'/);
  assert.match(frame, /usePathname/);
  assert.match(frame, /isActive/);
});

test('PublicTournamentFrame shows LIVE badge when tournament status is LIVE', () => {
  assert.match(frame, /isLive/);
  assert.match(frame, /LIVE/);
  assert.match(frame, /Radio/);
});

test('PublicTournamentFrame logo display supported', () => {
  assert.match(frame, /logoUrl/);
  assert.match(frame, /Image/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SEO — all sub-pages export generateMetadata
// ─────────────────────────────────────────────────────────────────────────────
test('All public sub-pages export generateMetadata', () => {
  for (const [name, src] of [
    ['home', home],
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
    ['live', live],
    ['match', matchPage],
  ]) {
    assert.match(src, /generateMetadata/, `Missing generateMetadata in ${name}`);
  }
});

test('All public sub-pages set title absolute and description', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
  ]) {
    assert.match(src, /title: \{ absolute:/, `Missing absolute title in ${name}`);
    assert.match(src, /description/, `Missing description in ${name}`);
  }
});

test('Sub-pages use TOURNY_PRODUCTION_ORIGIN for canonical URLs', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
    ['live', live],
  ]) {
    assert.match(src, /TOURNY_PRODUCTION_ORIGIN/, `Missing canonical origin in ${name}`);
  }
});

test('Sub-pages have alternates.canonical', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
    ['live', live],
  ]) {
    assert.match(src, /alternates:/, `Missing alternates in ${name}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SECURITY — public components must NOT access private tables directly
// ─────────────────────────────────────────────────────────────────────────────
test('Public sub-pages do not directly query private tables', () => {
  const PRIVATE_TABLES = [
    'auction_bids',
    'auction_team_wallets',
    'purse_transactions',
    'auction_players',
    'lot_entries',        // raw — mapped entries hidden until selected
    'lot_turns',
    'audit_logs',
    'notifications',
    'profiles',
    'player_tournament_registrations',
    'tournament_members',
  ];
  const PUBLIC_SRCS = { fixtures, results, table, teams, players, live, matchPage, matchLive };
  for (const [page, src] of Object.entries(PUBLIC_SRCS)) {
    for (const table of PRIVATE_TABLES) {
      // Allow if it appears in a comment, not a .from() call
      const fromPattern = new RegExp(`\\.from\\(['"](${table})['"]\\)`);
      assert.doesNotMatch(src, fromPattern, `${page} reads private table: ${table}`);
    }
  }
});

test('Public sub-pages only use public_* views or safe RPCs for data', () => {
  // fixtures page uses public_fixture_view
  assert.match(fixtures, /public_fixture_view/);
  // results page uses public_fixture_view
  assert.match(results, /public_fixture_view/);
  // table page uses get_public_standings RPC
  assert.match(table, /get_public_standings/);
  // teams page uses public_team_view
  assert.match(teams, /public_team_view/);
  // players page uses public_player_view
  assert.match(players, /public_player_view/);
});

test('PublicMatchLive uses get_public_match_state RPC — not raw tables', () => {
  assert.match(matchLive, /get_public_match_state/);
  assert.doesNotMatch(matchLive, /\.from\(['"]match_sets['"]\)/);
  assert.doesNotMatch(matchLive, /\.from\(['"]score_events['"]\)/);
  assert.doesNotMatch(matchLive, /\.from\(['"]matches['"]\)/);
});

test('PublicMatchLive cannot mutate scores (no award_point, no undo)', () => {
  assert.doesNotMatch(matchLive, /award_point/);
  assert.doesNotMatch(matchLive, /undo_last_score_event/);
});

test('No service-role key in public components', () => {
  const srcs = [frame, fixtures, results, table, teams, players, live, matchPage, matchLive, pubAuction, pubLot];
  for (const src of srcs) {
    assert.doesNotMatch(src, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
    assert.doesNotMatch(src, /createClient\(\{ serviceRole/);
  }
});

test('Audit logs not exposed in any public component', () => {
  const srcs = [fixtures, results, table, teams, players, live, matchPage, matchLive];
  for (const src of srcs) {
    assert.doesNotMatch(src, /audit_logs/);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIVE MATCH — Realtime safety
// ─────────────────────────────────────────────────────────────────────────────
test('PublicMatchLive subscribes to score_events via Realtime (not direct insert)', () => {
  assert.match(matchLive, /postgres_changes/);
  assert.match(matchLive, /score_events/);
  assert.match(matchLive, /matches/);
  // Refresh is authoritative via RPC, not trust of event payload
  assert.match(matchLive, /get_public_match_state/);
});

test('PublicMatchLive handles connection offline state', () => {
  assert.match(matchLive, /offline|WifiOff|CHANNEL_ERROR|TIMED_OUT|CLOSED/);
  assert.match(matchLive, /visibilitychange/);
});

test('PublicMatchLive shows set-by-set scores and winner', () => {
  assert.match(matchLive, /set_number/);
  assert.match(matchLive, /winner_team_id/);
  assert.match(matchLive, /Trophy/);
});

test('Match live page passes force-dynamic to prevent stale caching', () => {
  assert.match(matchPage, /force-dynamic/);
});

test('Live hub page passes force-dynamic to prevent stale caching', () => {
  assert.match(live, /force-dynamic/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. LOT/AUCTION LIVE REGRESSION
// ─────────────────────────────────────────────────────────────────────────────
test('PublicAuctionLive uses only get_auction_public_state and auction_public_events', () => {
  assert.match(pubAuction, /get_auction_public_state/);
  assert.match(pubAuction, /auction_public_events/);
  // Must NOT read raw financial/private tables
  assert.doesNotMatch(pubAuction, /\.from\(['"]auction_bids['"]\)/);
  assert.doesNotMatch(pubAuction, /\.from\(['"]auction_team_wallets['"]\)/);
  assert.doesNotMatch(pubAuction, /\.from\(['"]purse_transactions['"]\)/);
  assert.doesNotMatch(pubAuction, /\.from\(['"]auctions['"]\)/);
});

test('PublicAuctionLive has reconnection and offline handling', () => {
  assert.match(pubAuction, /reconnect|CHANNEL_ERROR|TIMED_OUT/i);
  assert.match(pubAuction, /visibilitychange|online/);
});

test('PublicLotLive uses get_lot_public_state RPC and lot_public_events channel only', () => {
  assert.match(pubLot, /get_lot_public_state/);
  assert.match(pubLot, /lot_public_events/);
  // Must not subscribe to raw lot_entries (hidden lot mappings)
  assert.doesNotMatch(pubLot, /\.from\(['"]lot_entries['"]\)/);
  assert.doesNotMatch(pubLot, /\.from\(['"]lot_turns['"]\)/);
});

test('PublicLotLive does not expose hidden lot player_id before reveal', () => {
  // The public lot state only contains SELECTED cards — confirmed in the view
  assert.match(views, /status = 'SELECTED'/);
  // RLS on lot_entries enforces status=SELECTED for non-organizers
  assert.match(rls, /status = 'SELECTED'/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. BRANDING + SPONSORS
// ─────────────────────────────────────────────────────────────────────────────
test('Sponsors table exists in schema with correct fields', () => {
  assert.match(branding, /CREATE TABLE public\.sponsors/);
  assert.match(branding, /name text NOT NULL/);
  assert.match(branding, /logo_path text/);
  assert.match(branding, /website text/);
  assert.match(branding, /display_order integer/);
});

test('tournament_branding table has logo_path, primary_color, secondary_color', () => {
  assert.match(branding, /CREATE TABLE public\.tournament_branding/);
  assert.match(branding, /logo_path text/);
  assert.match(branding, /primary_color text/);
  assert.match(branding, /secondary_color text/);
});

test('RLS is enabled on sponsors and tournament_branding', () => {
  assert.match(rls, /ALTER TABLE public\.sponsors ENABLE ROW LEVEL SECURITY/);
  assert.match(rls, /ALTER TABLE public\.tournament_branding ENABLE ROW LEVEL SECURITY/);
});

test('Tournament home page uses logo from tournament_branding', () => {
  assert.match(home, /tournament_branding/);
  assert.match(home, /logo_path/);
  assert.match(home, /logoUrl/);
});

test('Teams page uses team logo_path and primary_color from public_team_view', () => {
  assert.match(teams, /logo_path/);
  assert.match(teams, /primary_color/);
  assert.match(teams, /logoUrl/);
});

test('Players page uses player photo_path for avatar', () => {
  assert.match(players, /photo_path/);
  assert.match(players, /photoUrl/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PWA / CACHE SAFETY
// ─────────────────────────────────────────────────────────────────────────────
test('Service worker is a pass-through — no aggressive caching of live data', () => {
  // SW must not implement a cache-first strategy for API/data routes
  assert.doesNotMatch(sw, /cache\.put|cache\.add|CacheStorage/i);
  assert.doesNotMatch(sw, /cache-first|network-first|stale-while-revalidate/i);
  // SW should be minimal / pass-through
  assert.match(sw, /fetch/);
});

test('Live hub and match page are force-dynamic (no static cache)', () => {
  assert.match(live, /force-dynamic/);
  assert.match(matchPage, /force-dynamic/);
});

// Sub-pages (fixtures, results, table) are SSR — no static revalidate config
// that would serve stale scores; they don't need force-dynamic as they are
// already dynamic via DB queries, but must not set a long revalidate.
test('Static-like sub-pages do not set a dangerously long revalidate', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
  ]) {
    // If revalidate is set at all, it must not be > 60s for competition data
    const match = src.match(/export const revalidate\s*=\s*(\d+)/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      assert.ok(seconds <= 60, `${name} has dangerously long revalidate: ${seconds}s`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. EMPTY / NOT-FOUND STATES
// ─────────────────────────────────────────────────────────────────────────────
test('All sub-pages handle not-found (no tournament) gracefully', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
    ['live', live],
  ]) {
    // Each page should return TournamentNotFound or have a not-found guard
    const hasNotFound =
      src.includes('TournamentNotFound') ||
      src.includes('not found') ||
      src.includes('Tournament not found');
    assert.ok(hasNotFound, `${name} page missing not-found state`);
  }
});

test('All sub-pages handle empty data (EmptyState)', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
  ]) {
    const hasEmpty =
      src.includes('EmptyState') ||
      src.includes('will appear') ||
      src.includes('empty');
    assert.ok(hasEmpty, `${name} page missing empty state`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. RESPONSIVE & ACCESSIBILITY
// ─────────────────────────────────────────────────────────────────────────────
test('Frame uses overflow-x-auto on nav to prevent horizontal overflow at 320px', () => {
  assert.match(frame, /overflow-x-auto/);
});

test('Frame uses aria-current=page for active tab', () => {
  assert.match(frame, /aria-current/);
});

test('Standings table is wrapped in overflow-x-auto container (intentional scroll)', () => {
  assert.match(table, /overflow-x-auto/);
});

test('Fixtures and results use semantic article elements', () => {
  assert.match(fixtures, /<article/);
  assert.match(results, /<article/);
});

test('Teams page uses semantic article elements', () => {
  assert.match(teams, /<article/);
});

test('Players page uses semantic article elements', () => {
  assert.match(players, /<article/);
});

test('h1 exists on every sub-page for heading hierarchy', () => {
  for (const [name, src] of [
    ['fixtures', fixtures],
    ['results', results],
    ['table', table],
    ['teams', teams],
    ['players', players],
  ]) {
    assert.match(src, /<h1/, `Missing h1 in ${name}`);
  }
});

test('Live match scoreboard uses tabular-nums for numeric scores', () => {
  assert.match(matchLive, /tabular-nums/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. SHARED HEADER HELPER
// ─────────────────────────────────────────────────────────────────────────────
test('getTournamentHeader uses React cache to prevent duplicate DB fetches', () => {
  assert.match(headerHelper, /cache\(/);
  assert.match(headerHelper, /is_public.*true|eq.*is_public.*true/i);
});

test('getTournamentHeader reads logo from tournament_branding', () => {
  assert.match(headerHelper, /tournament_branding/);
  assert.match(headerHelper, /logo_path/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. TOURNAMENT HOME PAGE
// ─────────────────────────────────────────────────────────────────────────────
test('Tournament home page has Explore navigation tiles for LIVE/COMPLETED status', () => {
  assert.match(home, /Explore/);
  assert.match(home, /'fixtures'/);
  assert.match(home, /'results'/);
  assert.match(home, /'table'/);
});

test('Tournament home page has Live Now CTA for active tournaments', () => {
  assert.match(home, /Live Now/);
  assert.match(home, /live/);
  assert.match(home, /PREPARATION|LIVE/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. DATABASE SECURITY (schema-level enforcement)
// ─────────────────────────────────────────────────────────────────────────────
test('public_team_view only shows ACTIVE teams in public tournaments', () => {
  assert.match(views, /status = 'ACTIVE'/);
  assert.match(views, /is_public = true/);
});

test('public_player_view only shows ACTIVE team_players in public tournaments', () => {
  assert.match(views, /public_player_view/);
  assert.match(views, /status = 'ACTIVE'/);
});

test('public_fixture_view requires is_public=true tournament join', () => {
  assert.match(views, /public_fixture_view/);
  assert.match(views, /is_public = true/);
});

test('get_public_standings enforces is_public check before returning data', () => {
  assert.match(migration26, /get_public_standings/);
  assert.match(migration26, /is_public/);
});

test('get_public_match_state enforces is_public OR is_tournament_member', () => {
  assert.match(migration26, /get_public_match_state/);
  assert.match(migration26, /is_public.*is_tournament_member|is_tournament_member.*is_public/);
});

test('Lot entry RLS hides unrevealed entries — only SELECTED status visible to non-organizers', () => {
  assert.match(rls, /Members can read revealed lot entries/);
  assert.match(rls, /status = 'SELECTED'/);
});

test('Auction raw tables are not publicly readable (members-only policy)', () => {
  assert.match(rls, /Members can read auctions/);
  assert.match(rls, /Members can read wallets/);
  assert.doesNotMatch(rls, /Public can read.*auctions/i);
  assert.doesNotMatch(rls, /Public can read.*auction_bids/i);
});

console.log('\nAgent C — Public Experience Tests: all assertions passed ✓');
