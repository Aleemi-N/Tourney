import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M25_DATABASE_URL;
if (!connectionString || !/127\.0\.0\.1|localhost/.test(connectionString)) {
  throw new Error('M25_DATABASE_URL must point to the local database');
}

const ids = {
  organizer: '28000000-0000-0000-0000-000000000001',
  owner1: '28000000-0000-0000-0000-000000000002',
  owner2: '28000000-0000-0000-0000-000000000003',
  normal: '28000000-0000-0000-0000-000000000004',
  organization: '28100000-0000-0000-0000-000000000001',
  tournament: '28200000-0000-0000-0000-000000000001',
  team1: '28300000-0000-0000-0000-000000000001',
  team2: '28300000-0000-0000-0000-000000000002',
};

const playerIds = Array.from(
  { length: 5 },
  (_, index) => `28400000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
);

const admin = new pg.Client({ connectionString });
const clients = [];

async function roleClient(role, userId) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query(`SET ROLE ${role}`);
  if (userId) await client.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId]);
  clients.push(client);
  return client;
}

async function cleanup() {
  await admin.query(
    `DELETE FROM public.purse_transactions
     WHERE wallet_id IN (
       SELECT id FROM public.auction_team_wallets
       WHERE auction_id IN (SELECT id FROM public.auctions WHERE tournament_id=$1)
     )`,
    [ids.tournament],
  );
  await admin.query(
    `DELETE FROM public.auction_sales
     WHERE auction_player_id IN (
       SELECT ap.id FROM public.auction_players ap
       JOIN public.auctions a ON a.id=ap.auction_id
       WHERE a.tournament_id=$1
     )`,
    [ids.tournament],
  );
  await admin.query(
    `DELETE FROM public.auction_bids
     WHERE auction_id IN (SELECT id FROM public.auctions WHERE tournament_id=$1)`,
    [ids.tournament],
  );
  await admin.query('DELETE FROM public.auctions WHERE tournament_id=$1', [ids.tournament]);
  await admin.query('DELETE FROM public.tournaments WHERE id=$1', [ids.tournament]);
  await admin.query('DELETE FROM public.organizations WHERE id=$1', [ids.organization]);
  await admin.query('DELETE FROM public.player_profiles WHERE id = ANY($1::uuid[])', [playerIds]);
  await admin.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [
    [ids.organizer, ids.owner1, ids.owner2, ids.normal],
  ]);
}

function rpcValue(result) {
  return result.rows[0].value;
}

await admin.connect();

try {
  await cleanup();
  await admin.query(
    `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ($1,'phase5c-organizer@tourny.local','{"full_name":"Phase 5C Organizer"}'),
      ($2,'phase5c-owner1@tourny.local','{"full_name":"Phase 5C Owner One"}'),
      ($3,'phase5c-owner2@tourny.local','{"full_name":"Phase 5C Owner Two"}'),
      ($4,'phase5c-normal@tourny.local','{"full_name":"Phase 5C Normal User"}')`,
    [ids.organizer, ids.owner1, ids.owner2, ids.normal],
  );
  await admin.query(
    `INSERT INTO public.organizations(id,name,slug,created_by)
     VALUES($1,'Phase 5C Integration','phase5c-integration',$2)`,
    [ids.organization, ids.organizer],
  );
  await admin.query(
    `INSERT INTO public.tournaments(
       id,organization_id,name,slug,format,league_mode,sport,status,is_public,created_by
     ) VALUES($1,$2,'Phase 5C Integration Auction','phase5c-integration-auction',
       'LEAGUE','AUCTION','VOLLEYBALL','REGISTRATION',true,$3)`,
    [ids.tournament, ids.organization, ids.organizer],
  );
  await admin.query(
    `INSERT INTO public.tournament_members(tournament_id,user_id,role,status) VALUES
       ($1,$2,'ORGANIZER','ACTIVE'),
       ($1,$3,'TEAM_OWNER','ACTIVE'),
       ($1,$4,'TEAM_OWNER','ACTIVE'),
       ($1,$5,'PLAYER','ACTIVE')`,
    [ids.tournament, ids.organizer, ids.owner1, ids.owner2, ids.normal],
  );
  await admin.query(
    `INSERT INTO public.tournament_settings(
       tournament_id,min_squad_size,max_squad_size,auction_starting_purse,
       auction_base_price,auction_bid_increment,icon_selection_method,
       setter_selection_method,reauction_price_rule
     ) VALUES($1,2,4,2000,100,100,'AUCTION','AUCTION','SAME_BASE_PRICE')`,
    [ids.tournament],
  );
  await admin.query(
    `INSERT INTO public.teams(id,tournament_id,name,short_name,status) VALUES
       ($1,$3,'Integration Thunderbolts With A Long Name','THU','ACTIVE'),
       ($2,$3,'Integration Cyclones','CYC','ACTIVE')`,
    [ids.team1, ids.team2, ids.tournament],
  );
  await admin.query(
    `INSERT INTO public.team_owners(team_id,user_id,is_primary,status) VALUES
       ($1,$3,true,'ACTIVE'),($2,$4,true,'ACTIVE')`,
    [ids.team1, ids.team2, ids.owner1, ids.owner2],
  );
  for (const [index, playerId] of playerIds.entries()) {
    await admin.query(
      `INSERT INTO public.player_profiles(id,display_name,primary_position,secondary_position)
       VALUES($1,$2,'UNIVERSAL','SETTER')`,
      [playerId, `Integration Player ${index + 1} With Long Name`],
    );
    await admin.query(
      `INSERT INTO public.player_tournament_registrations(
         tournament_id,player_id,status,registration_number
       ) VALUES($1,$2,'PENDING',$3)`,
      [ids.tournament, playerId, `INT-${index + 1}`],
    );
  }

  const organizer = await roleClient('authenticated', ids.organizer);
  const owner1 = await roleClient('authenticated', ids.owner1);
  const owner2 = await roleClient('authenticated', ids.owner2);
  const owner1Retry = await roleClient('authenticated', ids.owner1);
  const owner2Retry = await roleClient('authenticated', ids.owner2);
  const normal = await roleClient('authenticated', ids.normal);
  const anon = await roleClient('anon');

  await organizer.query(
    `SELECT public.update_auction_price_categories(
       $1,'Category A Premium International',500,'Category B Standard',300,'Category C Development',100
     )`,
    [ids.tournament],
  );
  const categories = (
    await admin.query(
      `SELECT id,category_code,base_price FROM public.tournament_auction_categories
       WHERE tournament_id=$1 ORDER BY display_order`,
      [ids.tournament],
    )
  ).rows;
  assert.deepEqual(categories.map((row) => Number(row.base_price)), [500, 300, 100]);

  const registrations = (
    await admin.query(
      `SELECT id FROM public.player_tournament_registrations
       WHERE tournament_id=$1 ORDER BY registration_number`,
      [ids.tournament],
    )
  ).rows;
  for (const [index, registration] of registrations.entries()) {
    const category = categories[Math.min(index, 2)];
    await organizer.query(
      `SELECT public.approve_player_registration($1,'MAIN_AUCTION',NULL,$2)`,
      [registration.id, category.id],
    );
  }

  const readiness = rpcValue(
    await organizer.query('SELECT public.get_auction_readiness($1) value', [ids.tournament]),
  );
  assert.equal(readiness.ready, true);

  const prepared = rpcValue(
    await organizer.query('SELECT public.prepare_auction($1) value', [ids.tournament]),
  );
  const auctionId = prepared.auction_id;
  assert.equal(Number(prepared.minimum_acquisition_reserve_price), 100);

  const discovery = await anon.query(
    `SELECT auction_id FROM public.auction_public_events
     WHERE tournament_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [ids.tournament],
  );
  assert.equal(discovery.rows[0].auction_id, auctionId);
  await assert.rejects(
    anon.query('SELECT public.prepare_auction($1)', [ids.tournament]),
    /permission denied/i,
  );
  await assert.rejects(
    normal.query("SELECT public.set_auction_lifecycle($1,'START',1,'normal-start')", [auctionId]),
    /unauthorized/i,
  );
  await assert.rejects(
    owner1.query('SELECT public.get_auction_owner_state($1,$2)', [auctionId, ids.team2]),
    /unauthorized/i,
  );

  let organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  assert.equal(Number(organizerState.minimum_acquisition_reserve_price), 100);
  assert.equal(Number(organizerState.teams[0].finance.reserve), 100);
  assert.equal(Number(organizerState.teams[0].finance.max_allowed_bid), 1900);
  assert.deepEqual(organizerState.categories.map((category) => category.code), ['A', 'B', 'C']);

  let lifecycle = rpcValue(
    await organizer.query(
      "SELECT public.set_auction_lifecycle($1,'START',$2,'integration-start') value",
      [auctionId, organizerState.auction.state_version],
    ),
  );
  let opened = rpcValue(
    await organizer.query(
      "SELECT public.open_next_auction_player($1,$2,'integration-open-1') value",
      [auctionId, lifecycle.state_version],
    ),
  );

  organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  let ownerState1 = rpcValue(
    await owner1.query('SELECT public.get_auction_owner_state($1,$2) value', [auctionId, ids.team1]),
  );
  let ownerState2 = rpcValue(
    await owner2.query('SELECT public.get_auction_owner_state($1,$2) value', [auctionId, ids.team2]),
  );
  let publicState = rpcValue(
    await anon.query('SELECT public.get_auction_public_state($1) value', [auctionId]),
  );
  assert.equal(organizerState.current_player.auction_player_id, opened.auction_player_id);
  assert.equal(ownerState1.current_player.auction_player_id, opened.auction_player_id);
  assert.equal(ownerState2.current_player.auction_player_id, opened.auction_player_id);
  assert.equal(publicState.current_player.auction_player_id, opened.auction_player_id);
  for (const privateField of ['team', 'minimum_acquisition_reserve_price', 'teams', 'readiness']) {
    assert.equal(Object.hasOwn(publicState, privateField), false);
  }

  const simultaneous = await Promise.allSettled([
    owner1.query(
      `SELECT public.place_auction_bid($1,$2,$3,500,'simultaneous-owner-1',$4,0) value`,
      [auctionId, opened.auction_player_id, ids.team1, opened.player_version],
    ),
    owner2.query(
      `SELECT public.place_auction_bid($1,$2,$3,500,'simultaneous-owner-2',$4,0) value`,
      [auctionId, opened.auction_player_id, ids.team2, opened.player_version],
    ),
  ]);
  assert.equal(simultaneous.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(simultaneous.filter((result) => result.status === 'rejected').length, 1);
  const firstWinnerIndex = simultaneous.findIndex((result) => result.status === 'fulfilled');
  const firstWinnerTeam = firstWinnerIndex === 0 ? ids.team1 : ids.team2;
  const firstLoserTeam = firstWinnerIndex === 0 ? ids.team2 : ids.team1;
  const firstLoser = firstWinnerIndex === 0 ? owner2 : owner1;

  assert.equal(
    (
      await admin.query(
        'SELECT count(*) FROM public.auction_bids WHERE auction_player_id=$1 AND amount=500',
        [opened.auction_player_id],
      )
    ).rows[0].count,
    '1',
  );
  const loserRefresh = rpcValue(
    await firstLoser.query('SELECT public.get_auction_owner_state($1,$2) value', [auctionId, firstLoserTeam]),
  );
  assert.equal(Number(loserRefresh.highest_bid.amount), 500);
  assert.equal(Number(loserRefresh.next_minimum_bid), 600);
  const secondBid = rpcValue(
    await firstLoser.query(
      `SELECT public.place_auction_bid($1,$2,$3,600,'loser-follow-up',$4,500) value`,
      [auctionId, opened.auction_player_id, firstLoserTeam, opened.player_version],
    ),
  );
  assert.equal(Number(secondBid.amount), 600);

  organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  lifecycle = rpcValue(
    await organizer.query(
      "SELECT public.set_auction_lifecycle($1,'PAUSE',$2,'integration-pause') value",
      [auctionId, organizerState.auction.state_version],
    ),
  );
  await assert.rejects(
    (firstWinnerIndex === 0 ? owner1 : owner2).query(
      `SELECT public.place_auction_bid($1,$2,$3,700,'paused-bid',$4,600)`,
      [auctionId, opened.auction_player_id, firstWinnerTeam, opened.player_version],
    ),
    /not live/i,
  );
  publicState = rpcValue(
    await anon.query('SELECT public.get_auction_public_state($1) value', [auctionId]),
  );
  assert.equal(publicState.auction.status, 'PAUSED');
  lifecycle = rpcValue(
    await organizer.query(
      "SELECT public.set_auction_lifecycle($1,'RESUME',$2,'integration-resume') value",
      [auctionId, lifecycle.state_version],
    ),
  );

  const retryClientA = firstWinnerIndex === 0 ? owner1 : owner2;
  const retryClientB = firstWinnerIndex === 0 ? owner1Retry : owner2Retry;
  const duplicate = await Promise.all([
    retryClientA.query(
      `SELECT public.place_auction_bid($1,$2,$3,700,'same-logical-bid',$4,600) value`,
      [auctionId, opened.auction_player_id, firstWinnerTeam, opened.player_version],
    ),
    retryClientB.query(
      `SELECT public.place_auction_bid($1,$2,$3,700,'same-logical-bid',$4,600) value`,
      [auctionId, opened.auction_player_id, firstWinnerTeam, opened.player_version],
    ),
  ]);
  assert.equal(rpcValue(duplicate[0]).bid_id, rpcValue(duplicate[1]).bid_id);
  assert.equal(
    (
      await admin.query(
        `SELECT count(*) FROM public.auction_bids
         WHERE auction_player_id=$1 AND idempotency_key='same-logical-bid'`,
        [opened.auction_player_id],
      )
    ).rows[0].count,
    '1',
  );

  const winningBidId = rpcValue(duplicate[0]).bid_id;
  const walletBefore = Number(
    (
      await admin.query(
        'SELECT remaining_balance FROM public.auction_team_wallets WHERE auction_id=$1 AND team_id=$2',
        [auctionId, firstWinnerTeam],
      )
    ).rows[0].remaining_balance,
  );
  const sold = rpcValue(
    await organizer.query(
      `SELECT public.finalize_auction_sale($1,$2,$3,$4,'integration-sold') value`,
      [auctionId, opened.auction_player_id, opened.player_version, winningBidId],
    ),
  );
  const soldRetry = rpcValue(
    await organizer.query(
      `SELECT public.finalize_auction_sale($1,$2,$3,$4,'integration-sold') value`,
      [auctionId, opened.auction_player_id, opened.player_version, winningBidId],
    ),
  );
  assert.equal(sold.sale_id, soldRetry.sale_id);
  await assert.rejects(
    organizer.query(
      `SELECT public.finalize_auction_sale($1,$2,$3,$4,'integration-stale-sold')`,
      [auctionId, opened.auction_player_id, opened.player_version, winningBidId],
    ),
    /stale|not live/i,
  );
  const walletAfter = Number(
    (
      await admin.query(
        'SELECT remaining_balance FROM public.auction_team_wallets WHERE auction_id=$1 AND team_id=$2',
        [auctionId, firstWinnerTeam],
      )
    ).rows[0].remaining_balance,
  );
  assert.equal(walletBefore - walletAfter, 700);
  assert.equal(
    (await admin.query('SELECT count(*) FROM public.auction_sales WHERE auction_player_id=$1', [opened.auction_player_id])).rows[0].count,
    '1',
  );
  assert.equal(
    (await admin.query('SELECT count(*) FROM public.purse_transactions WHERE auction_sale_id=$1', [sold.sale_id])).rows[0].count,
    '1',
  );
  assert.equal(
    (
      await admin.query(
        `SELECT count(*) FROM public.team_players
         WHERE tournament_id=$1
           AND player_id=(SELECT player_id FROM public.auction_players WHERE id=$2)
           AND team_id=$3 AND status='ACTIVE'`,
        [ids.tournament, opened.auction_player_id, firstWinnerTeam],
      )
    ).rows[0].count,
    '1',
  );

  organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  opened = rpcValue(
    await organizer.query(
      "SELECT public.open_next_auction_player($1,$2,'integration-open-2') value",
      [auctionId, organizerState.auction.state_version],
    ),
  );
  let unsold = rpcValue(
    await organizer.query(
      "SELECT public.mark_auction_player_unsold($1,$2,$3,'integration-unsold-same') value",
      [auctionId, opened.auction_player_id, opened.player_version],
    ),
  );
  let requeued = rpcValue(
    await organizer.query(
      "SELECT public.requeue_auction_player($1,$2,$3,'integration-requeue-same') value",
      [auctionId, opened.auction_player_id, unsold.player_version],
    ),
  );
  const originalBase = Number(
    (await admin.query('SELECT original_base_price FROM public.auction_players WHERE id=$1', [opened.auction_player_id])).rows[0].original_base_price,
  );
  assert.equal(Number(requeued.base_price), originalBase);

  await admin.query(
    `UPDATE public.tournament_settings SET reauction_price_rule='ORGANIZER_SETS_PRICE'
     WHERE tournament_id=$1`,
    [ids.tournament],
  );
  organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  opened = rpcValue(
    await organizer.query(
      "SELECT public.open_next_auction_player($1,$2,'integration-open-3') value",
      [auctionId, organizerState.auction.state_version],
    ),
  );
  unsold = rpcValue(
    await organizer.query(
      "SELECT public.mark_auction_player_unsold($1,$2,$3,'integration-unsold-custom') value",
      [auctionId, opened.auction_player_id, opened.player_version],
    ),
  );
  const requeuedWithNegativePrice = organizer.query(
    "SELECT public.requeue_auction_player($1,$2,$3,'integration-requeue-negative',$4) value",
    [auctionId, opened.auction_player_id, unsold.player_version, -50],
  );
  await assert.rejects(requeuedWithNegativePrice, /must be positive/i);

  requeued = rpcValue(
    await organizer.query(
      "SELECT public.requeue_auction_player($1,$2,$3,'integration-requeue-custom',$4) value",
      [auctionId, opened.auction_player_id, unsold.player_version, 50],
    ),
  );
  const customOriginalBase = Number(
    (await admin.query('SELECT original_base_price FROM public.auction_players WHERE id=$1', [opened.auction_player_id])).rows[0].original_base_price,
  );
  assert.equal(customOriginalBase, originalBase); // 300 (or whatever it was initially)
  assert.equal(Number(requeued.base_price), 50);

  while (true) {
    organizerState = rpcValue(
      await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
    );
    if (!Number(organizerState.progress.waiting)) break;
    const next = rpcValue(
      await organizer.query(
        'SELECT public.open_next_auction_player($1,$2,$3) value',
        [auctionId, organizerState.auction.state_version, `drain-open-${organizerState.last_sequence}`],
      ),
    );
    await organizer.query(
      'SELECT public.mark_auction_player_unsold($1,$2,$3,$4)',
      [auctionId, next.auction_player_id, next.player_version, `drain-unsold-${organizerState.last_sequence}`],
    );
  }

  organizerState = rpcValue(
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [auctionId]),
  );
  const completed = rpcValue(
    await organizer.query(
      "SELECT public.complete_auction($1,$2,'integration-complete') value",
      [auctionId, organizerState.auction.state_version],
    ),
  );
  assert.equal(completed.status, 'COMPLETED');
  ownerState1 = rpcValue(
    await owner1.query('SELECT public.get_auction_owner_state($1,$2) value', [auctionId, ids.team1]),
  );
  publicState = rpcValue(
    await anon.query('SELECT public.get_auction_public_state($1) value', [auctionId]),
  );
  assert.equal(ownerState1.auction.status, 'COMPLETED');
  assert.equal(ownerState1.team.may_bid, false);
  assert.equal(publicState.auction.status, 'COMPLETED');
  assert.equal(Number(publicState.progress.sold), 1);
  assert.equal(Number(publicState.progress.unsold), 4);

  const publicationTables = (
    await admin.query(
      `SELECT tablename FROM pg_publication_tables
       WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename LIKE 'auction_%'
       ORDER BY tablename`,
    )
  ).rows.map((row) => row.tablename);
  assert.deepEqual(publicationTables, ['auction_public_events']);
  const unsafeFunctions = (
    await admin.query(
      `SELECT p.proname, p.prosecdef, p.proconfig
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY($1::text[])`,
      [[
        'place_auction_bid',
        'finalize_auction_sale',
        'mark_auction_player_unsold',
        'get_auction_owner_state',
        'get_auction_organizer_state',
        'get_auction_public_state',
      ]],
    )
  ).rows;
  assert.equal(unsafeFunctions.length, 6);
  assert.ok(unsafeFunctions.every((fn) => fn.prosecdef));
  assert.ok(
    unsafeFunctions.every((fn) =>
      (fn.proconfig ?? []).some((setting) => setting === 'search_path=pg_catalog, public'),
    ),
  );

  console.log(
    JSON.stringify({
      status: 'PASS',
      auctionId,
      simultaneousBid: { succeeded: 1, rejected: 1, acceptedAmount: 500 },
      losingOwnerFollowUpBid: 600,
      idempotentBidRows: 1,
      soldAmount: 700,
      sales: 1,
      purseTransactions: 1,
      squadAssignments: 1,
      completed: true,
      realtimeTables: publicationTables,
    }),
  );
} finally {
  await Promise.allSettled(clients.map((client) => client.end()));
  await cleanup();
  await admin.end();
}
