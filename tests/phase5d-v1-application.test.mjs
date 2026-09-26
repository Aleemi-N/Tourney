import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const scorer = read('src/components/scorer/ScorerMatchClient.tsx');
const organizerFixtures = read('src/components/organizer/FixtureManager.tsx');
const publicAuction = read('src/app/(public)/t/[slug]/live/PublicAuctionLive.tsx');
const publicFrame = read('src/components/public/PublicTournamentFrame.tsx');
const player = read('src/app/(player)/player/page.tsx');
const migration = read('supabase/migrations/20260924000026_v1_fixtures_scoring_snapshots.sql');

test('fixture and scorer mutations stay behind trusted RPCs', () => {
  assert.match(organizerFixtures, /generate_stage_fixtures/);
  assert.match(organizerFixtures, /assign_match_scorer/);
  assert.doesNotMatch(organizerFixtures, /\.from\(['"]matches['"]\)\.insert/);
  assert.match(scorer, /award_point/);
  assert.match(scorer, /undo_last_score_event/);
  assert.match(scorer, /call_match_timeout/);
  assert.match(scorer, /end_match_timeout/);
  assert.match(scorer, /crypto\.randomUUID\(\)/);
  assert.match(scorer, /get_scorer_match_state/);
  for (const table of ['score_events', 'matches', 'match_timeouts']) {
    assert.match(scorer, new RegExp(`table: ['"]${table}['"]`));
  }
  assert.doesNotMatch(scorer, /\.from\(['"](?:matches|match_sets|score_events|match_timeouts)['"]\)\.(?:insert|update|delete)/);
});

test('Migration 26 authorizes scorer state and safe public state separately', () => {
  assert.match(migration, /is_assigned_scorer\(p_match_id\)/);
  assert.match(migration, /get_public_match_state/);
  assert.match(migration, /generate_stage_fixtures/);
  assert.match(migration, /assign_match_scorer/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /search_path = pg_catalog, public/);
});

test('public V1 surfaces are projection-based and auction realtime is sanitized', () => {
  assert.match(publicAuction, /get_auction_public_state/);
  assert.match(publicAuction, /auction_public_events/);
  assert.doesNotMatch(publicAuction, /\.from\(['"](?:auction_bids|auction_team_wallets|purse_transactions)['"]\)/);
  for (const route of ['Live', 'Fixtures', 'Results', 'Table', 'Teams', 'Players']) assert.match(publicFrame, new RegExp(route));
});

test('player portal is authenticated and server-authoritative', () => {
  assert.match(player, /auth\.getUser/);
  assert.match(player, /player_profiles/);
  assert.match(player, /player_tournament_registrations/);
  assert.doesNotMatch(player, /coming soon|fake|placeholder/i);
});

console.log('Phase 5D/5F application surfaces: PASS');
