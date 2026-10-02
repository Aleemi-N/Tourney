const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function test() {
  await client.connect();
  const auctionRes = await client.query("SELECT id, state_version FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  const auctionId = auctionRes.rows[0].id;
  const version = auctionRes.rows[0].state_version;

  console.log(`Testing open_next_auction_player with auctionId: ${auctionId}, version: ${version}`);

  try {
    const res = await client.query(`SELECT public.open_next_auction_player($1, $2, $3)`, [auctionId, version, 'test_request_' + Date.now()]);
    console.log('Result:', res.rows[0]);
  } catch (err) {
    console.error('RPC Error:', err.message);
  }

  await client.end();
}
test().catch(console.error);
