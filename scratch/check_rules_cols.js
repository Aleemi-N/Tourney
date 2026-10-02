const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  let res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'volleyball_rules'");
  console.log('volleyball_rules columns:', res.rows.map(r=>r.column_name));
  await client.end();
}
run();
