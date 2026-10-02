const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const tourneyId = '90200000-0000-0000-0000-000000000001';
  const res = await client.query("SELECT id, name, stage_type, sequence, status FROM public.tournament_stages WHERE tournament_id = $1 ORDER BY sequence", [tourneyId]);
  console.log('Existing stages:', res.rows);
  await client.end();
}
run();
