const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function test() {
  await client.connect();
  const auctionRes = await client.query("SELECT id, state_version, tournament_id FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  const auctionId = auctionRes.rows[0].id;
  const version = auctionRes.rows[0].state_version;
  const tournamentId = auctionRes.rows[0].tournament_id;

  const orgRes = await client.query("SELECT user_id FROM public.tournament_members WHERE tournament_id = $1 AND role = 'ORGANIZER' LIMIT 1;", [tournamentId]);
  const orgId = orgRes.rows[0].user_id;

  console.log(`Testing open_next_auction_player with auctionId: ${auctionId}, version: ${version}, orgId: ${orgId}`);

  try {
    await client.query("BEGIN;");
    // Set local auth
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${orgId}"}';`);
    const res = await client.query(`SELECT public.open_next_auction_player($1, $2, $3)`, [auctionId, version, 'test_request_' + Date.now()]);
    console.log('Result:', res.rows[0]);
    await client.query("COMMIT;");
  } catch (err) {
    console.error('RPC Error:', err.message);
  }

  await client.end();
}
test().catch(console.error);
