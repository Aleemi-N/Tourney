const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();

  // Drop existing policies first if any
  await client.query(`DROP POLICY IF EXISTS "tournament_stages_select" ON public.tournament_stages;`);
  await client.query(`DROP POLICY IF EXISTS "tournament_stages_organizer_write" ON public.tournament_stages;`);
  
  // Add SELECT policy - members can see stages for their tournaments, public can see public tournament stages  
  await client.query(`
    CREATE POLICY "tournament_stages_select"
      ON public.tournament_stages
      FOR SELECT
      USING (
        tournament_id IN (
          SELECT tournament_id FROM public.tournament_members WHERE user_id = auth.uid()
        )
        OR
        tournament_id IN (
          SELECT id FROM public.tournaments WHERE is_public = true
        )
      );
  `);
  console.log('SELECT policy created');

  // Add ALL policy - organizers can do everything
  await client.query(`
    CREATE POLICY "tournament_stages_organizer_write"
      ON public.tournament_stages
      FOR ALL
      USING (
        tournament_id IN (
          SELECT tournament_id FROM public.tournament_members 
          WHERE user_id = auth.uid() AND role = 'ORGANIZER'
        )
      )
      WITH CHECK (
        tournament_id IN (
          SELECT tournament_id FROM public.tournament_members 
          WHERE user_id = auth.uid() AND role = 'ORGANIZER'
        )
      );
  `);
  console.log('ALL (organizer) policy created');

  // Verify
  const check = await client.query(`SELECT policyname, cmd FROM pg_policies WHERE tablename = 'tournament_stages';`);
  console.log('Policies now:', check.rows);

  await client.end();
  console.log('Done! Refresh the Fixtures page now.');
}
run().catch(e => { console.error(e.message); process.exit(1); });
