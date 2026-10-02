const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const state = await client.query('SELECT * FROM public.auction_public_state;');
  console.log('Auction Public State:', JSON.stringify(state.rows, null, 2));

  const lots = await client.query("SELECT id, lot_number, status, player_id FROM public.auction_lots WHERE tournament_id = '90200000-0000-0000-0000-000000000001' ORDER BY lot_number ASC LIMIT 10;");
  console.log('Sample lots:', lots.rows);
  await client.end();
}
check().catch(console.error);
