const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  let res = await client.query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'auction_bids_source_check'");
  console.log('Constraint:', res.rows[0]);
  await client.end();
}
run();
