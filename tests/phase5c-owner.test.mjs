import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const dashboard = read('src/app/(owner)/owner/dashboard/page.tsx');
const ownerRoot = read('src/app/(owner)/owner/page.tsx');
const teamContext = read('src/lib/owner/owner-team.ts');
const squad = read('src/app/(owner)/owner/teams/[teamId]/page.tsx');
const auctionPage = read('src/app/(owner)/owner/teams/[teamId]/auction/page.tsx');
const auction = read('src/components/owner/OwnerAuctionClient.tsx');
const shell = read('src/components/owner/OwnerPortalShell.tsx');
const profile = read('src/app/(account)/profile/page.tsx');

test('owner context is active-owner and team scoped for multiple teams', () => {
    assert.match(teamContext, /team_owners/);
    assert.match(teamContext, /\.eq\('user_id', userId\)/);
    assert.match(teamContext, /\.eq\('status', 'ACTIVE'\)/);
    assert.match(auctionPage, /params: Promise<\{ teamId: string \}>/);
    assert.match(auctionPage, /teams\.find\(\(item\) => item\.id === teamId\)/);
    assert.match(dashboard, /teams\.map/);
});

test('owner dashboard and squad expose the intended owner workflow', () => {
    assert.match(ownerRoot, /redirect\('\/owner\/dashboard'\)/);
    for (const label of ['Overview', 'My Squad', 'Live Auction', 'Fixtures', 'Results']) assert.match(shell, new RegExp(label));
    assert.match(squad, /team_players/);
    assert.match(squad, /status', 'ACTIVE'/);
    assert.match(squad, /acquisition_type/);
    assert.match(squad, /acquisition_amount/);
    assert.match(squad, /SOLD and lot-assigned ACTIVE players/);
    assert.match(squad, /max_squad_size/);
    assert.match(squad, /squad\.length/);
});

test('owner bidding uses the trusted RPC with stale-state inputs and idempotency', () => {
    assert.match(auction, /place_auction_bid/);
    assert.match(auction, /p_request_key: crypto\.randomUUID\(\)/);
    assert.match(auction, /p_expected_player_version: snapshot\.current_player\.state_version/);
    assert.match(auction, /p_expected_highest_bid: snapshot\.highest_bid\?\.amount \?\? 0/);
    assert.match(auction, /bidState === 'pending'/);
    assert.match(auction, /setBidState\('rejected'\)/);
    assert.match(auction, /await refreshSnapshot\(\)/);
    assert.match(auction, /The bid was not accepted/);
    assert.doesNotMatch(auction, /setMessage\(error\.message\)/);
    assert.doesNotMatch(auction, /from\(['"]auction_bids/);
    assert.doesNotMatch(auction, /from\(['"]auction_team_wallets/);
    assert.doesNotMatch(auction, /from\(['"]auction_players/);
});

test('owner finance and auction display come from the owner snapshot', () => {
    assert.match(auctionPage, /get_auction_owner_state/);
    for (const field of ['remaining_purse', 'spent_purse', 'protected_reserve', 'max_allowed_bid', 'minimum_squad', 'maximum_squad']) assert.match(auction, new RegExp(field));
    for (const field of ['category_code', 'category_label', 'category_base_price', 'primary_position', 'display_name']) assert.match(auction, new RegExp(field));
    assert.match(auction, /team\?\.may_bid/);
    assert.match(auction, /numericAmount > Number\(team\?\.max_allowed_bid/);
    for (const state of ['Leading', 'Outbid', 'Cannot bid']) assert.match(auction, new RegExp(state));
});

test('owner realtime listens only to sanitized events and recovers snapshots', () => {
    assert.match(auction, /table: 'auction_public_events'/);
    assert.match(auction, /visibilitychange/);
    assert.match(auction, /addEventListener\('online'/);
    assert.match(auction, /sequence_number/);
    assert.match(auction, /CHANNEL_ERROR|TIMED_OUT|CLOSED/);
    assert.match(auction, /get_auction_owner_state/);
    for (const rawTable of ['auction_bids', 'auction_team_wallets', 'auction_players', 'auction_sales', 'purse_transactions']) assert.doesNotMatch(auction, new RegExp(`table: ['"]${rawTable}`));
});

test('owner controls are bid-only and responsive for phone layouts', () => {
    assert.doesNotMatch(auction, /prepare_auction|set_auction_lifecycle|finalize_auction_sale|mark_auction_player_unsold|open_next_auction_player|requeue_auction_player|complete_auction/);
    assert.match(auction, /min-h-12/);
    assert.match(auction, /sm:grid-cols/);
    assert.match(auction, /xl:grid-cols/);
    assert.match(shell, /Switch team/);
    assert.match(shell, /lg:hidden/);
});

test('account profile resolves authoritative owner assignments and exposes the team portal', () => {
    assert.match(profile, /\.from\('team_owners'\)/);
    assert.match(profile, /\.eq\('user_id', user\.id\)/);
    assert.match(profile, /\.eq\('status', 'ACTIVE'\)/);
    assert.match(profile, /href="\/owner\/dashboard"/);
    assert.match(profile, /Go to Team Portal/);
    assert.match(profile, /Open Team Portal/);
    assert.doesNotMatch(profile, /ownerApplications\?\.forEach/);
});

console.log('Phase 5C owner application: PASS');
