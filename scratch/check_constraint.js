const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const res = await client.query("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'auction_players_status_check';");
  console.log('Constraint definition:', res.rows[0]);
  await client.end();
}
check().catch(console.error);
