import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M25_DATABASE_URL;
if (!connectionString || !/127\.0\.0\.1|localhost/.test(connectionString)) {
  throw new Error('M25_DATABASE_URL must point to the local database');
}

const ids = {
  organizer: '90000000-0000-0000-0000-000000000001',
  owner1: '90000000-0000-0000-0000-000000000002',
  owner2: '90000000-0000-0000-0000-000000000003',
  normal: '90000000-0000-0000-0000-000000000004',
  organization: '90100000-0000-0000-0000-000000000001',
  tournament: '90200000-0000-0000-0000-000000000001',
  team1: '90300000-0000-0000-0000-000000000001',
  team2: '90300000-0000-0000-0000-000000000002',
};

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

function rpcValue(res) {
  return res.rows[0].value;
}

async function run() {
  await admin.connect();
  const organizer = await roleClient('authenticated', ids.organizer);

  // Fetch existing auction
  let auctionId;
  const existingAuction = await admin.query('SELECT id, status FROM public.auctions WHERE tournament_id=$1', [ids.tournament]);
  if (existingAuction.rows.length > 0) {
    auctionId = existingAuction.rows[0].id;
    if (existingAuction.rows[0].status === 'PREPARING') {
       await organizer.query("SELECT public.prepare_auction($1)", [ids.tournament]);
    }
  } else {
    // Should be prepared via prepare_auction
    const prepared = await organizer.query("SELECT public.prepare_auction($1) value", [ids.tournament]);
    auctionId = rpcValue(prepared).id;
  }
  
  const categories = await admin.query('SELECT id, base_price FROM public.tournament_auction_categories WHERE tournament_id=$1', [ids.tournament]);
  const catA = categories.rows[0].id;
  const catB = categories.rows[1]?.id || categories.rows[0].id;
  
  // ==========================================
  // TEST 1: REJECTED PLAYER
  // ==========================================
  // 1.1 Create profile and registration (REJECTED)
  const rejectPlayerId = '28990000-0000-0000-0000-000000000001';
  await admin.query(`
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) 
    VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'reject@example.com', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Reject Player"}', now(), now(), '', '', '', '')
    ON CONFLICT (id) DO NOTHING;
  `, [rejectPlayerId]);
  await admin.query(`UPDATE public.profiles SET full_name='Reject Player' WHERE id=$1`, [rejectPlayerId]);
  await admin.query(`
    INSERT INTO public.player_profiles(id, display_name, primary_position)
    VALUES($1, 'Reject Player', 'SETTER') ON CONFLICT DO NOTHING
  `, [rejectPlayerId]);
  
  const regRejectRes = await admin.query(`
    INSERT INTO public.player_tournament_registrations(player_id, tournament_id, status)
    VALUES($1, $2, 'REJECTED') RETURNING id
  `, [rejectPlayerId, ids.tournament]);
  const regRejectId = regRejectRes.rows[0].id;

  // Insert initial audit
  await admin.query(`
    INSERT INTO public.audit_logs(tournament_id, user_id, action, entity_type, entity_id)
    VALUES($1, $2, 'PLAYER_REGISTRATION_REJECTED', 'player_tournament_registrations', $3)
  `, [ids.tournament, ids.organizer, regRejectId]);

  // Record initial audit count for this player
  const preAuditCount = (await admin.query(`SELECT count(*) FROM public.audit_logs WHERE tournament_id=$1 AND entity_id=$2`, [ids.tournament, regRejectId])).rows[0].count;

  // Re-add through RPC
  const rejectAddRes = await organizer.query(`
    SELECT public.quick_add_player_to_live_auction($1, $2, $3, null, null, null, null) value
  `, [auctionId, catA, rejectPlayerId]);
  const rejectAdd = rpcValue(rejectAddRes);
  
  // Verify AFTER:
  const postRegReject = await admin.query(`SELECT * FROM public.player_tournament_registrations WHERE id=$1`, [regRejectId]);
  assert.equal(postRegReject.rows[0].status, 'APPROVED');
  assert.equal(postRegReject.rows[0].auction_category, 'MAIN_AUCTION');
  assert.equal(postRegReject.rows[0].auction_price_category_id, catA);
  
  const postAuctionPlayerReject = await admin.query(`SELECT * FROM public.auction_players WHERE auction_id=$1 AND player_id=$2`, [auctionId, rejectPlayerId]);
  assert.equal(postAuctionPlayerReject.rows.length, 1);
  assert.equal(postAuctionPlayerReject.rows[0].status, 'WAITING');
  assert.equal(Number(postAuctionPlayerReject.rows[0].base_price), 500);

  const postAuditCount = (await admin.query(`SELECT count(*) FROM public.audit_logs WHERE tournament_id=$1 AND entity_id=$2 AND action='PLAYER_REGISTRATION_RE-APPROVED'`, [ids.tournament, regRejectId])).rows[0].count;
  assert.equal(Number(postAuditCount), 1, "Re-approval audit event missing");
  const totalAuditCount = (await admin.query(`SELECT count(*) FROM public.audit_logs WHERE tournament_id=$1 AND entity_id=$2`, [ids.tournament, regRejectId])).rows[0].count;
  assert.equal(Number(totalAuditCount) > Number(preAuditCount), true, "Rejection history must be preserved");

  // Idempotency test (should return same auction player id without throwing error)
  const rejectAddRes2 = await organizer.query(`
    SELECT public.quick_add_player_to_live_auction($1, $2, $3, null, null, null, null) value
  `, [auctionId, catA, rejectPlayerId]);
  assert.equal(rpcValue(rejectAddRes2).auction_player_id, rejectAdd.auction_player_id);

  // ==========================================
  // TEST 2: APPROVED EXISTING PLAYER
  // ==========================================
  const approvedPlayerId = '28990000-0000-0000-0000-000000000002';
  await admin.query(`
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) 
    VALUES ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', 'approved@example.com', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Approved Player"}', now(), now(), '', '', '', '')
    ON CONFLICT (id) DO NOTHING;
  `);
  await admin.query(`UPDATE public.profiles SET full_name='Approved Player' WHERE id=$1`, [approvedPlayerId]);
  await admin.query(`
    INSERT INTO public.player_profiles(id, display_name, primary_position)
    VALUES($1, 'Approved Player', 'LIBERO') ON CONFLICT DO NOTHING
  `, [approvedPlayerId]);
  
  const regApprovedRes = await admin.query(`
    INSERT INTO public.player_tournament_registrations(player_id, tournament_id, status)
    VALUES($1, $2, 'APPROVED') RETURNING id
  `, [approvedPlayerId, ids.tournament]);
  const regApprovedId = regApprovedRes.rows[0].id;

  const approvedAddRes = await organizer.query(`
    SELECT public.quick_add_player_to_live_auction($1, $2, $3, null, null, null, null) value
  `, [auctionId, catB, approvedPlayerId]);
  
  const postRegApproved = await admin.query(`SELECT * FROM public.player_tournament_registrations WHERE id=$1`, [regApprovedId]);
  assert.equal(postRegApproved.rows[0].status, 'APPROVED');
  assert.equal(postRegApproved.rows[0].auction_category, 'MAIN_AUCTION');
  
  const postAuctionPlayerApproved = await admin.query(`SELECT * FROM public.auction_players WHERE auction_id=$1 AND player_id=$2`, [auctionId, approvedPlayerId]);
  assert.equal(postAuctionPlayerApproved.rows.length, 1);
  assert.equal(postAuctionPlayerApproved.rows[0].status, 'WAITING');

  // ==========================================
  // TEST 4: QUICK ADD NEW PLAYER
  // ==========================================
  const quickAddRes = await organizer.query(`
    SELECT public.quick_add_player_to_live_auction($1, $2, null, 'New Guy', 'OPPOSITE', null, '555-1234') value
  `, [auctionId, catB]);
  
  const newPlayerId = rpcValue(quickAddRes).player_id;
  const newProfile = await admin.query('SELECT * FROM public.player_profiles WHERE id=$1', [newPlayerId]);
  assert.equal(newProfile.rows[0].display_name, 'New Guy');
  assert.equal(newProfile.rows[0].primary_position, 'OPPOSITE');
  
  const newReg = await admin.query('SELECT * FROM public.player_tournament_registrations WHERE player_id=$1 AND tournament_id=$2', [newPlayerId, ids.tournament]);
  assert.equal(newReg.rows.length, 1);
  assert.equal(newReg.rows[0].status, 'APPROVED');
  assert.equal(newReg.rows[0].auction_category, 'MAIN_AUCTION');

  const newAp = await admin.query('SELECT * FROM public.auction_players WHERE auction_id=$1 AND player_id=$2', [auctionId, newPlayerId]);
  assert.equal(newAp.rows.length, 1);
  assert.equal(newAp.rows[0].status, 'WAITING');

  console.log(JSON.stringify({ status: 'PASS' }));
  
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    for (const client of clients) await client.end();
    await admin.end();
  });
