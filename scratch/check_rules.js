const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  
  await client.query(`
    INSERT INTO public.volleyball_rules (tournament_id, sets_to_win, win_by_two)
    VALUES ('90200000-0000-0000-0000-000000000001', 2, true)
    ON CONFLICT DO NOTHING;
  `);
  
  console.log("Successfully created volleyball rules for the tournament!");
  
  await client.end();
}
run();
