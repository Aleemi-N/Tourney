import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M25_DATABASE_URL;
if (!connectionString) throw new Error('M25_DATABASE_URL is required');
const admin = new pg.Client({ connectionString });
await admin.connect();
await admin.query(`
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
   ('26000000-0000-0000-0000-000000000001','m25-race-org@example.test','{"full_name":"Race Organizer"}'),
   ('26000000-0000-0000-0000-000000000002','m25-race-a@example.test','{"full_name":"Race A"}'),
   ('26000000-0000-0000-0000-000000000003','m25-race-b@example.test','{"full_name":"Race B"}');
  INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('26100000-0000-0000-0000-000000000001','Race Org','m25-race','26000000-0000-0000-0000-000000000001');
  INSERT INTO public.tournaments(id,organization_id,name,slug,format,league_mode,is_public,created_by) VALUES ('26200000-0000-0000-0000-000000000001','26100000-0000-0000-0000-000000000001','Race Auction','m25-race','LEAGUE','AUCTION',true,'26000000-0000-0000-0000-000000000001');
  INSERT INTO public.tournament_members(tournament_id,user_id,role) VALUES
   ('26200000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000001','ORGANIZER'),
   ('26200000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002','TEAM_OWNER'),
   ('26200000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000003','TEAM_OWNER');
  INSERT INTO public.tournament_settings(tournament_id,min_squad_size,max_squad_size,auction_starting_purse,auction_base_price,auction_bid_increment,icon_selection_method,setter_selection_method) VALUES ('26200000-0000-0000-0000-000000000001',1,3,1000,100,100,'AUCTION','AUCTION');
  INSERT INTO public.teams(id,tournament_id,name,status) VALUES
   ('26300000-0000-0000-0000-000000000001','26200000-0000-0000-0000-000000000001','Race Alpha','ACTIVE'),
   ('26300000-0000-0000-0000-000000000002','26200000-0000-0000-0000-000000000001','Race Beta','ACTIVE');
  INSERT INTO public.team_owners(team_id,user_id,is_primary,status) VALUES
   ('26300000-0000-0000-0000-000000000001','26000000-0000-0000-0000-000000000002',true,'ACTIVE'),
   ('26300000-0000-0000-0000-000000000002','26000000-0000-0000-0000-000000000003',true,'ACTIVE');
  INSERT INTO public.player_profiles(id,display_name,primary_position) VALUES
   ('26400000-0000-0000-0000-000000000001','Race Player 1','UNIVERSAL'),
   ('26400000-0000-0000-0000-000000000002','Race Player 2','UNIVERSAL'),
   ('26400000-0000-0000-0000-000000000003','Race Player 3','UNIVERSAL'),
   ('26400000-0000-0000-0000-000000000004','Race Player 4','UNIVERSAL'),
   ('26400000-0000-0000-0000-000000000005','Race Player 5','UNIVERSAL');
  INSERT INTO public.player_tournament_registrations(tournament_id,player_id,status,auction_category) VALUES
   ('26200000-0000-0000-0000-000000000001','26400000-0000-0000-0000-000000000001','PENDING',NULL),
   ('26200000-0000-0000-0000-000000000001','26400000-0000-0000-0000-000000000002','PENDING',NULL),
   ('26200000-0000-0000-0000-000000000001','26400000-0000-0000-0000-000000000003','PENDING',NULL),
   ('26200000-0000-0000-0000-000000000001','26400000-0000-0000-0000-000000000004','PENDING',NULL),
   ('26200000-0000-0000-0000-000000000001','26400000-0000-0000-0000-000000000005','PENDING',NULL);
`);

async function client(user) {
  const c = new pg.Client({ connectionString });
  await c.connect();
  await c.query('SET ROLE authenticated');
  await c.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [user]);
  return c;
}

const organizer = await client('26000000-0000-0000-0000-000000000001');
const ownerA = await client('26000000-0000-0000-0000-000000000002');
const ownerB = await client('26000000-0000-0000-0000-000000000003');
const organizer2 = await client('26000000-0000-0000-0000-000000000001');
const ownerB2 = await client('26000000-0000-0000-0000-000000000003');
await organizer.query(`SELECT public.update_auction_price_categories($1,'Category A',500,'Category B',300,'Category C',100)`, ['26200000-0000-0000-0000-000000000001']);
const category = (await admin.query(`SELECT id FROM public.tournament_auction_categories WHERE tournament_id=$1 AND category_code='C'`, ['26200000-0000-0000-0000-000000000001'])).rows[0].id;
for (const registration of (await admin.query(`SELECT id FROM public.player_tournament_registrations WHERE tournament_id=$1`, ['26200000-0000-0000-0000-000000000001'])).rows) {
  await organizer.query(`SELECT public.approve_player_registration($1,'MAIN_AUCTION',NULL,$2)`, [registration.id, category]);
}
const prepared = (await organizer.query(`SELECT public.prepare_auction($1) value`, ['26200000-0000-0000-0000-000000000001'])).rows[0].value;
const auction = prepared.auction_id;
let version = (await admin.query(`SELECT state_version FROM public.auctions WHERE id=$1`, [auction])).rows[0].state_version;
const started = (await organizer.query(`SELECT public.set_auction_lifecycle($1,'START',$2,'race-start') value`, [auction, version])).rows[0].value;

const nextRace = await Promise.allSettled([
  organizer.query(`SELECT public.open_next_auction_player($1,$2,'next-a') value`, [auction, started.state_version]),
  (async () => { const c = await client('26000000-0000-0000-0000-000000000001'); try { return await c.query(`SELECT public.open_next_auction_player($1,$2,'next-b') value`, [auction, started.state_version]); } finally { await c.end(); } })(),
]);
assert.equal(nextRace.filter((x) => x.status === 'fulfilled').length, 1, 'one next-player call succeeds');
let live = (await admin.query(`SELECT id,state_version FROM public.auction_players WHERE auction_id=$1 AND status='LIVE'`, [auction])).rows;
assert.equal(live.length, 1, 'one live player');

const samePrice = await Promise.allSettled([
  ownerA.query(`SELECT public.place_auction_bid($1,$2,$3,100,'price-a',$4,0) value`, [auction, live[0].id, '26300000-0000-0000-0000-000000000001', live[0].state_version]),
  ownerB.query(`SELECT public.place_auction_bid($1,$2,$3,100,'price-b',$4,0) value`, [auction, live[0].id, '26300000-0000-0000-0000-000000000002', live[0].state_version]),
]);
assert.equal(samePrice.filter((x) => x.status === 'fulfilled').length, 1, 'one same-price bid succeeds');

const current = (await admin.query(`SELECT max(amount) amount FROM public.auction_bids WHERE auction_player_id=$1`, [live[0].id])).rows[0].amount;
const duplicate = await Promise.all([
  ownerA.query(`SELECT public.place_auction_bid($1,$2,$3,$4,'duplicate-key',$5,$6) value`, [auction, live[0].id, '26300000-0000-0000-0000-000000000001', Number(current) + 100, live[0].state_version, current]),
  ownerA.query(`SELECT public.place_auction_bid($1,$2,$3,$4,'duplicate-key',$5,$6) value`, [auction, live[0].id, '26300000-0000-0000-0000-000000000001', Number(current) + 100, live[0].state_version, current]),
]);
assert.equal(duplicate[0].rows[0].value.bid_id, duplicate[1].rows[0].value.bid_id, 'same-key retries reconstruct one bid');
assert.equal((await admin.query(`SELECT count(*) FROM public.auction_bids WHERE auction_id=$1 AND idempotency_key='duplicate-key'`, [auction])).rows[0].count, '1');

const winner = (await admin.query(`SELECT id FROM public.auction_bids WHERE auction_player_id=$1 ORDER BY amount DESC,created_at,id LIMIT 1`, [live[0].id])).rows[0].id;
const terminal = await Promise.allSettled([
  organizer.query(`SELECT public.finalize_auction_sale($1,$2,$3,$4,'terminal-sold')`, [auction, live[0].id, live[0].state_version, winner]),
  organizer.query(`SELECT public.mark_auction_player_unsold($1,$2,$3,'terminal-unsold')`, [auction, live[0].id, live[0].state_version]),
]);
assert.equal(terminal.filter((x) => x.status === 'fulfilled').length, 1, 'sold versus unsold has one result');
assert.equal((await admin.query(`SELECT count(*) FROM public.auction_sales WHERE auction_player_id=$1`, [live[0].id])).rows[0].count, '1');
assert.equal((await admin.query(`SELECT count(*) FROM public.purse_transactions WHERE auction_sale_id IS NOT NULL`, [])).rows[0].count, '1');
assert.equal((await admin.query(`SELECT count(*) FROM public.team_players WHERE tournament_id=$1 AND acquisition_type='AUCTION'`, ['26200000-0000-0000-0000-000000000001'])).rows[0].count, '1');
assert.equal((await admin.query(`SELECT count(*) FROM public.auction_team_wallets WHERE remaining_balance<0 OR spent_amount<0`)).rows[0].count, '0');

// Same-team rapid bids, stale-state rejection, and bid-versus-SOLD serialization.
version = (await admin.query(`SELECT state_version FROM public.auctions WHERE id=$1`, [auction])).rows[0].state_version;
let opened = (await organizer.query(`SELECT public.open_next_auction_player($1,$2,'next-second') value`, [auction, version])).rows[0].value;
const rapid = await Promise.allSettled([
  ownerB.query(`SELECT public.place_auction_bid($1,$2,$3,100,'rapid-a',$4,0) value`, [auction, opened.auction_player_id, '26300000-0000-0000-0000-000000000002', opened.player_version]),
  ownerB2.query(`SELECT public.place_auction_bid($1,$2,$3,100,'rapid-b',$4,0) value`, [auction, opened.auction_player_id, '26300000-0000-0000-0000-000000000002', opened.player_version]),
]);
assert.equal(rapid.filter((x) => x.status === 'fulfilled').length, 1, 'one rapid same-team bid succeeds');
await assert.rejects(ownerB.query(`SELECT public.place_auction_bid($1,$2,$3,200,'stale-bid',$4,0)`, [auction, opened.auction_player_id, '26300000-0000-0000-0000-000000000002', opened.player_version]), /stale/i);
let winning = (await admin.query(`SELECT id FROM public.auction_bids WHERE auction_player_id=$1 ORDER BY amount DESC,created_at,id LIMIT 1`, [opened.auction_player_id])).rows[0].id;
const bidVsSold = await Promise.allSettled([
  ownerA.query(`SELECT public.place_auction_bid($1,$2,$3,200,'bid-vs-sold',$4,100)`, [auction, opened.auction_player_id, '26300000-0000-0000-0000-000000000001', opened.player_version]),
  organizer.query(`SELECT public.finalize_auction_sale($1,$2,$3,$4,'sale-vs-bid')`, [auction, opened.auction_player_id, opened.player_version, winning]),
]);
assert.equal(bidVsSold.filter((x) => x.status === 'fulfilled').length, 1, 'bid versus SOLD has one authoritative winner');
if ((await admin.query(`SELECT status FROM public.auction_players WHERE id=$1`, [opened.auction_player_id])).rows[0].status === 'LIVE') {
  winning = (await admin.query(`SELECT id FROM public.auction_bids WHERE auction_player_id=$1 ORDER BY amount DESC,created_at,id LIMIT 1`, [opened.auction_player_id])).rows[0].id;
  await organizer.query(`SELECT public.finalize_auction_sale($1,$2,$3,$4,'sale-after-bid-race')`, [auction, opened.auction_player_id, opened.player_version, winning]);
}

// Two concurrent SOLD operations produce one sale/debit/allocation.
version = (await admin.query(`SELECT state_version FROM public.auctions WHERE id=$1`, [auction])).rows[0].state_version;
opened = (await organizer.query(`SELECT public.open_next_auction_player($1,$2,'next-third') value`, [auction, version])).rows[0].value;
const thirdBid = (await ownerA.query(`SELECT public.place_auction_bid($1,$2,$3,100,'third-bid',$4,0) value`, [auction, opened.auction_player_id, '26300000-0000-0000-0000-000000000001', opened.player_version])).rows[0].value;
const soldRace = await Promise.allSettled([
  organizer.query(`SELECT public.finalize_auction_sale($1,$2,$3,$4,'sold-race-a')`, [auction, opened.auction_player_id, opened.player_version, thirdBid.bid_id]),
  organizer2.query(`SELECT public.finalize_auction_sale($1,$2,$3,$4,'sold-race-b')`, [auction, opened.auction_player_id, opened.player_version, thirdBid.bid_id]),
]);
assert.equal(soldRace.filter((x) => x.status === 'fulfilled').length, 1, 'one concurrent SOLD succeeds');
assert.equal((await admin.query(`SELECT count(*) FROM public.auction_sales WHERE auction_player_id=$1`, [opened.auction_player_id])).rows[0].count, '1');

// Concurrent requeue attempts advance the attempt exactly once.
version = (await admin.query(`SELECT state_version FROM public.auctions WHERE id=$1`, [auction])).rows[0].state_version;
opened = (await organizer.query(`SELECT public.open_next_auction_player($1,$2,'next-fourth') value`, [auction, version])).rows[0].value;
const unsold = (await organizer.query(`SELECT public.mark_auction_player_unsold($1,$2,$3,'unsold-fourth') value`, [auction, opened.auction_player_id, opened.player_version])).rows[0].value;
const requeueRace = await Promise.allSettled([
  organizer.query(`SELECT public.requeue_auction_player($1,$2,$3,'requeue-a')`, [auction, opened.auction_player_id, unsold.player_version]),
  organizer2.query(`SELECT public.requeue_auction_player($1,$2,$3,'requeue-b')`, [auction, opened.auction_player_id, unsold.player_version]),
]);
assert.equal(requeueRace.filter((x) => x.status === 'fulfilled').length, 1, 'one concurrent requeue succeeds');
assert.equal((await admin.query(`SELECT attempt_number FROM public.auction_players WHERE id=$1`, [opened.auction_player_id])).rows[0].attempt_number, 2);

// The team-row lock in the roster guard serializes cross-workflow max-squad races.
await admin.query(`INSERT INTO public.player_profiles(id,display_name,primary_position) VALUES
 ('26400000-0000-0000-0001-000000000001','Capacity 1','UNIVERSAL'),
 ('26400000-0000-0000-0001-000000000002','Capacity 2','UNIVERSAL'),
 ('26400000-0000-0000-0001-000000000003','Capacity 3','UNIVERSAL')`);
const capacityClients = await Promise.all([1, 2, 3].map(async () => { const c = new pg.Client({ connectionString }); await c.connect(); return c; }));
const capacity = await Promise.allSettled(capacityClients.map((c, index) => c.query(`INSERT INTO public.team_players(tournament_id,team_id,player_id,acquisition_type,status) VALUES($1,$2,$3,'MANUAL','ACTIVE')`, ['26200000-0000-0000-0000-000000000001', '26300000-0000-0000-0000-000000000002', `26400000-0000-0000-0001-00000000000${index + 1}`])));
assert.equal((await admin.query(`SELECT count(*) FROM public.team_players WHERE tournament_id=$1 AND team_id=$2 AND status='ACTIVE'`, ['26200000-0000-0000-0000-000000000001', '26300000-0000-0000-0000-000000000002'])).rows[0].count, '3');
assert.ok(capacity.some((x) => x.status === 'rejected'), 'max-squad race rejects overflow');
await Promise.all(capacityClients.map((c) => c.end()));

await Promise.all([organizer.end(), organizer2.end(), ownerA.end(), ownerB.end(), ownerB2.end(), admin.end()]);
console.log('Migration 25 concurrency: PASS (10 guarded race classes)');
