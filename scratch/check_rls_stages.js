const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  
  // Check if RLS is even enabled
  const rlsEnabled = await client.query(`
    SELECT relname, relrowsecurity 
    FROM pg_class 
    WHERE relname = 'tournament_stages';
  `);
  console.log('RLS enabled?', rlsEnabled.rows);
  
  // Try to simulate what Next.js server component does
  // It uses anon key or service key?
  // Check if there are any policies at all
  const policies = await client.query(`
    SELECT COUNT(*) as policy_count FROM pg_policies WHERE tablename = 'tournament_stages';
  `);
  console.log('Policy count:', policies.rows[0].policy_count);
  
  // Get the full stage details that the page query would fetch
  const stage = await client.query(`
    SELECT 
      ts.id, ts.name, ts.stage_type, ts.sequence, ts.qualification_count, ts.status
    FROM public.tournament_stages ts
    WHERE ts.tournament_id = '90200000-0000-0000-0000-000000000001'
    ORDER BY ts.sequence;
  `);
  console.log('Stage full details:', stage.rows);

  await client.end();
}
run();
