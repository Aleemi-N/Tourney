const fs = require('fs');
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  });
  await client.connect();
  console.log('Connected to Postgres.');

  const sql = fs.readFileSync('supabase/migrations/20261002000041_add_phone_to_auction_public_state.sql', 'utf8');
  await client.query(sql);
  console.log('Successfully applied 20261002000041_add_phone_to_auction_public_state.sql');

  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
