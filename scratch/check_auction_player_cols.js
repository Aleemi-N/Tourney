const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const res = await client.query("SELECT * FROM public.auction_players LIMIT 1;");
  console.log('Auction Player row:', res.rows[0]);
  await client.end();
}
check().catch(console.error);
