const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const auction = await client.query("SELECT * FROM public.auctions WHERE tournament_id = '90200000-0000-0000-0000-000000000001';");
  console.log('Auction:', auction.rows);

  const players = await client.query("SELECT id, status, current_bid_amount, player_profile_id FROM public.auction_players WHERE tournament_id = '90200000-0000-0000-0000-000000000001' LIMIT 5;");
  console.log('Sample auction players:', players.rows);
  await client.end();
}
check().catch(console.error);
