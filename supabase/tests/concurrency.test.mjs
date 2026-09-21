
import pg from 'pg';
import assert from 'assert';

const { Pool } = pg;
const DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const pool = new Pool({
  connectionString: DB_URL,
  max: 20
});

async function execAsUser(userId, query, params = []) {
  const client = await pool.connect();
  try {
    await client.query(`SET SESSION ROLE authenticated`);
    await client.query(`SET request.jwt.claims = '{"sub": "${userId}", "role": "authenticated"}'`);
    return await client.query(query, params);
  } finally {
    client.release();
  }
}

async function runConcurrencyTests() {
  console.log("Setting up data for concurrency tests...");
  const client = await pool.connect();
  
  // Fixed IDs for test
  const orgId = '11111111-1111-1111-1111-c00000000000';
  const tournId = '22222222-2222-2222-2222-c00000000000';
  const team1Id = '33333333-3333-3333-3333-c00000000001';
  const team2Id = '33333333-3333-3333-3333-c00000000002';
  
  const organizerId = '00000000-0000-0000-0000-c00000000001';
  const owner1Id = '00000000-0000-0000-0000-c00000000002';
  const owner2Id = '00000000-0000-0000-0000-c00000000003';
  const scorerId = '00000000-0000-0000-0000-c00000000005';
  
  const profileId = '55555555-5555-5555-5555-c00000000000';
  const lotProfileId = '55555555-5555-5555-5555-c00000000001';

  try {
    // 1. Cleanup previous runs
    await client.query(`DELETE FROM public.purse_transactions`);
    await client.query(`DELETE FROM public.team_players`);
    await client.query(`DELETE FROM public.score_events`);
    await client.query(`DELETE FROM public.auction_sales`);
    await client.query(`DELETE FROM public.auction_bids`);
    await client.query(`DELETE FROM public.matches WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.auctions WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.lot_sessions WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.tournaments WHERE id = $1`, [tournId]);
    await client.query(`DELETE FROM public.organizations WHERE id = $1`, [orgId]);
    await client.query(`DELETE FROM public.player_profiles WHERE id IN ($1, $2)`, [profileId, lotProfileId]);
    await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3, $4)`, [organizerId, owner1Id, owner2Id, scorerId]);

    // 2. Setup Base Data
    await client.query(`INSERT INTO auth.users (id) VALUES ($1), ($2), ($3), ($4)`, [organizerId, owner1Id, owner2Id, scorerId]);
    await client.query(`INSERT INTO public.profiles (id, full_name) VALUES ($1, 'Org'), ($2, 'O1'), ($3, 'O2'), ($4, 'Scorer') ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`, [organizerId, owner1Id, owner2Id, scorerId]);
    
    await client.query(`INSERT INTO public.organizations (id, name, slug, created_by) VALUES ($1, 'Org', 'org-c', $2)`, [orgId, organizerId]);
    await client.query(`INSERT INTO public.tournaments (id, organization_id, name, slug, format, is_public, created_by) VALUES ($1, $2, 'Tourn', 'tourn-c', 'KNOCKOUT', true, $3)`, [tournId, orgId, organizerId]);
    
    await client.query(`INSERT INTO public.teams (id, tournament_id, name) VALUES ($1, $3, 'T1'), ($2, $3, 'T2')`, [team1Id, team2Id, tournId]);
    await client.query(`INSERT INTO public.tournament_members (tournament_id, user_id, role, team_id) VALUES 
      ($1, $2, 'ORGANIZER', NULL),
      ($1, $3, 'TEAM_OWNER', $5),
      ($1, $4, 'TEAM_OWNER', $6)`, [tournId, organizerId, owner1Id, owner2Id, team1Id, team2Id]);
      
    await client.query(`INSERT INTO public.team_owners (team_id, user_id, is_primary) VALUES ($1, $3, true), ($2, $4, true)`, [team1Id, team2Id, owner1Id, owner2Id]);

    // ---- Test A: Simultaneous Auction Bids ----
    console.log("Running Test: Simultaneous Auction Bids");
    const auctionId = 'c1111111-1111-1111-1111-c00000000000';
    const playerId = 'e1111111-1111-1111-1111-c00000000000';
    await client.query(`INSERT INTO public.auctions (id, tournament_id, status, minimum_bid_increment, starting_purse) VALUES ($1, $2, 'LIVE', 100, 1000)`, [auctionId, tournId]);
    await client.query(`INSERT INTO public.auction_team_wallets (id, auction_id, team_id, starting_balance, remaining_balance) VALUES (gen_random_uuid(), $1, $2, 1000, 1000), (gen_random_uuid(), $1, $3, 1000, 1000)`, [auctionId, team1Id, team2Id]);
    // Mock player profile
    await client.query(`INSERT INTO public.player_profiles (id, user_id, display_name, primary_position) VALUES ($1, $2, 'P1', 'SETTER'), ($3, $4, 'P2', 'SETTER')`, [profileId, organizerId, lotProfileId, scorerId]);
    await client.query(`INSERT INTO public.auction_players (id, auction_id, player_id, base_price, status) VALUES ($1, $2, $3, 200, 'LIVE')`, [playerId, auctionId, profileId]);

    // Fire two bids concurrently for the exact same amount
    const bidP1 = execAsUser(owner1Id, `SELECT public.place_auction_bid($1, $2, $3, 300)`, [auctionId, playerId, team1Id]);
    const bidP2 = execAsUser(owner2Id, `SELECT public.place_auction_bid($1, $2, $3, 300)`, [auctionId, playerId, team2Id]);
    
    const results = await Promise.allSettled([bidP1, bidP2]);
    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    
    assert.strictEqual(succeeded.length, 1, 'Exactly one bid should succeed');
    assert.strictEqual(failed.length, 1, 'Exactly one bid should fail due to concurrency control');
    assert(failed[0].reason.message.includes('Bid must be at least'), 'Failure reason should be bid increment (the second query reads the updated highest bid or conflicts)');
    console.log("  ✅ Simultaneous Auction Bids handled correctly");

    // ---- Test B: Simultaneous Selection of the same Lot ----
    console.log("Running Test: Simultaneous Selection of the same Lot");
    const lotSessionId = '66666666-6666-6666-6666-c00000000000';
    await client.query(`INSERT INTO public.lot_sessions (id, tournament_id, lot_type, status, created_by) VALUES ($1, $2, 'ICON', 'LIVE', $3)`, [lotSessionId, tournId, organizerId]);
    await client.query(`INSERT INTO public.lot_entries (lot_session_id, lot_number, player_id, status) VALUES ($1, 1, $2, 'AVAILABLE')`, [lotSessionId, lotProfileId]);
    // Give Team 1 an active turn and Team 2 a waiting turn
    await client.query(`INSERT INTO public.lot_turns (lot_session_id, turn_order, team_id, status) VALUES ($1, 1, $2, 'ACTIVE'), ($1, 2, $3, 'WAITING')`, [lotSessionId, team1Id, team2Id]);

    const lotP1 = execAsUser(owner1Id, `SELECT public.select_lot($1, 1, $2)`, [lotSessionId, team1Id]);
    const lotP2 = execAsUser(owner1Id, `SELECT public.select_lot($1, 1, $2)`, [lotSessionId, team1Id]);

    const lotResults = await Promise.allSettled([lotP1, lotP2]);
    const lotSucceeded = lotResults.filter(r => r.status === 'fulfilled');
    const lotFailed = lotResults.filter(r => r.status === 'rejected');
    lotResults.forEach((r, idx) => {
      if (r.status === 'rejected') {
        console.log(`Lot ${idx+1} failed with:`, r.reason.message || r.reason);
      }
    });

    assert.strictEqual(lotSucceeded.length, 1, 'Exactly one lot selection should succeed');
    assert.strictEqual(lotFailed.length, 1, 'Exactly one lot selection should fail');
    assert(lotFailed[0].reason.message.includes('No active turn found') || lotFailed[0].reason.message.includes('could not serialize access') || lotFailed[0].reason.message.includes('It is not this teams turn'), 'Failure reason should be expected');
    console.log("  ✅ Simultaneous Lot Selection handled correctly");

    // ---- Test C: Simultaneous finalization of the same auction player ----
    console.log("Running Test: Simultaneous Finalization of the same auction player");
    const finP1 = execAsUser(organizerId, `SELECT public.finalize_auction_sale($1, $2)`, [auctionId, playerId]);
    const finP2 = execAsUser(organizerId, `SELECT public.finalize_auction_sale($1, $2)`, [auctionId, playerId]);

    const finResults = await Promise.allSettled([finP1, finP2]);
    const finSucceeded = finResults.filter(r => r.status === 'fulfilled');
    const finFailed = finResults.filter(r => r.status === 'rejected');

    assert.strictEqual(finSucceeded.length, 1, 'Exactly one finalization should succeed');
    assert.strictEqual(finFailed.length, 1, 'Exactly one finalization should fail');
    // The exact error message depends on RPC implementation (e.g., "Player is not LIVE")
    console.log("  ✅ Simultaneous Finalization handled correctly");

    // ---- Test D: Idempotency & Scoring ----
    console.log("Running Test: Scoring Idempotency");
    const matchId = '77777777-7777-7777-7777-c00000000000';
    await client.query(`INSERT INTO public.matches (id, tournament_id, home_team_id, away_team_id, status) VALUES ($1, $2, $3, $4, 'LIVE')`, [matchId, tournId, team1Id, team2Id]);
    await client.query(`INSERT INTO public.match_scorers (match_id, user_id, assigned_by) VALUES ($1, $2, $3)`, [matchId, scorerId, organizerId]);
    await client.query(`INSERT INTO public.match_sets (id, match_id, set_number, target_points, status) VALUES (gen_random_uuid(), $1, 1, 21, 'LIVE')`, [matchId]);

    // A. Sequential same key
    const keyA = 'idemp-A';
    await execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyA]);
    await execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyA]);
    await execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyA]);
    let scoreRes = await client.query(`SELECT home_score FROM public.match_sets WHERE match_id = $1`, [matchId]);
    assert.strictEqual(scoreRes.rows[0].home_score, 1, 'Sequential retries should result in exactly 1 point');
    
    // B. Concurrent same key
    const keyB = 'idemp-B';
    const scoreP1 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyB]);
    const scoreP2 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyB]);
    const scoreP3 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, keyB]);
    await Promise.allSettled([scoreP1, scoreP2, scoreP3]);
    scoreRes = await client.query(`SELECT home_score FROM public.match_sets WHERE match_id = $1`, [matchId]);
    assert.strictEqual(scoreRes.rows[0].home_score, 2, 'Concurrent retries with same key should result in exactly 1 additional point (2 total)');
    
    // C. Concurrent different keys
    const pC1 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, 'idemp-C1']);
    const pC2 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, 'idemp-C2']);
    const pC3 = execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, 'idemp-C3']);
    await Promise.allSettled([pC1, pC2, pC3]);
    scoreRes = await client.query(`SELECT home_score FROM public.match_sets WHERE match_id = $1`, [matchId]);
    assert.strictEqual(scoreRes.rows[0].home_score, 5, 'Concurrent distinct keys should result in 3 additional points (5 total)');
    
    // D. Retry after successful response (done in A and B effectively)
    
    // E. Retry after the original point has been undone
    await execAsUser(scorerId, `SELECT public.undo_last_score_event($1)`, [matchId]); // undoes C3
    scoreRes = await client.query(`SELECT home_score FROM public.match_sets WHERE match_id = $1`, [matchId]);
    assert.strictEqual(scoreRes.rows[0].home_score, 4, 'Undo should reduce score to 4');
    
    await execAsUser(scorerId, `SELECT public.award_point($1, $2, $3)`, [matchId, team1Id, 'idemp-C3']);
    scoreRes = await client.query(`SELECT home_score FROM public.match_sets WHERE match_id = $1`, [matchId]);
    assert.strictEqual(scoreRes.rows[0].home_score, 4, 'Retrying undone key should NOT recreate point');
    
    console.log("  ✅ Scoring idempotency handled consistently");

    console.log("All concurrency tests completed successfully.");
  } catch (err) {
    console.error("Concurrency test failed:", err);
    process.exit(1);
  } finally {
    // Cleanup
    await client.query(`DELETE FROM public.purse_transactions`);
    await client.query(`DELETE FROM public.team_players`);
    await client.query(`DELETE FROM public.score_events`);
    await client.query(`DELETE FROM public.auction_sales`);
    await client.query(`DELETE FROM public.auction_bids`);
    await client.query(`DELETE FROM public.matches WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.auctions WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.lot_sessions WHERE tournament_id = $1`, [tournId]);
    await client.query(`DELETE FROM public.tournaments WHERE id = $1`, [tournId]);
    await client.query(`DELETE FROM public.organizations WHERE id = $1`, [orgId]);
    await client.query(`DELETE FROM public.player_profiles WHERE id IN ($1, $2)`, [profileId, lotProfileId]);
    await client.query(`DELETE FROM auth.users WHERE id IN ($1, $2, $3, $4)`, [organizerId, owner1Id, owner2Id, scorerId]);
    client.release();
    await pool.end();
  }
}

runConcurrencyTests();


