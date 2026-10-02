const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });

async function check() {
  await client.connect();
  const tables = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%auction%' OR table_name LIKE '%tourn%';");
  console.log('Tables:', tables.rows);
  await client.end();
}
check().catch(console.error);
