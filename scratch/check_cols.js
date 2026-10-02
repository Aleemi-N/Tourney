const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const sales = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'auction_sales';");
  console.log('auction_sales cols:', sales.rows.map(r => r.column_name));
  
  const bids = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'auction_bids';");
  console.log('auction_bids cols:', bids.rows.map(r => r.column_name));

  await client.end();
}
check().catch(console.error);
