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
    for (const label of ['Overview', 'My Squad', 'Live Auction', 'Fixtures', 'Results']) assert.match(shell, new RegExp(label, 'i'));
    assert.match(squad, /team_players/);
    assert.match(squad, /status', 'ACTIVE'/);
    assert.match(squad, /acquisition_type/);
    assert.match(squad, /acquisition_amount/);
    assert.match(squad, /SOLD and lot-assigned ACTIVE players/);
    assert.match(squad, /max_squad_size/);
    assert.match(squad, /squad\.length/);
});

// Since 1b0dd72 owners call bids out in the venue and the organizer enters them, so the owner view is read-only.
test('owner auction view is read-only: bids are called out to the auctioneer offline', () => {
    assert.match(auction, /Bidding is Managed Offline/);
    assert.doesNotMatch(auction, /place_auction_bid/);
    assert.doesNotMatch(auction, /from\(['"]auction_bids/);
    assert.doesNotMatch(auction, /from\(['"]auction_team_wallets/);
    assert.doesNotMatch(auction, /from\(['"]auction_players/);
});

test('owner finance and auction display come from the owner snapshot', () => {
    assert.match(auctionPage, /get_auction_owner_state/);
    for (const field of ['remaining_purse', 'spent_purse', 'protected_reserve', 'max_allowed_bid', 'minimum_squad', 'maximum_squad']) assert.match(auction, new RegExp(field));
    for (const field of ['category_code', 'category_label']) assert.match(auction, new RegExp(field));
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

test('owner controls never mutate the auction and stay responsive', () => {
    assert.doesNotMatch(auction, /prepare_auction|set_auction_lifecycle|finalize_auction_sale|mark_auction_player_unsold|open_next_auction_player|requeue_auction_player|complete_auction/);
    assert.match(auction, /xl:grid-cols/);
    // Team switching lives in the shared AppShell (sidebar on desktop, "More" sheet on phones).
    assert.match(shell, /Your teams/);
    assert.match(shell, /AppShell/);
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
