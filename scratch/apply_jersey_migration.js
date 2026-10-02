const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  });
  await client.connect();
  console.log('Connected to local PostgreSQL database.');

  const migrationPath = path.join(__dirname, '../supabase/migrations/20261002000042_add_jersey_details_to_player_profiles.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await client.query(sql);
    console.log('Successfully applied migration 20261002000042_add_jersey_details_to_player_profiles.sql');
  } catch (err) {
    console.error('Failed to apply migration:', err);
  } finally {
    await client.end();
  }
}

main();
