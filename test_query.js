const { createClient } = require('@supabase/supabase-js');

// Read from .env.local
const env = require('fs').readFileSync('.env.local', 'utf8');
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(supabaseUrl, anonKey);

async function run() {
  console.log('Testing anon query...');
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      id, 
      slug, 
      name, 
      status, 
      is_public,
      tournament_branding (logo_path),
      tournament_settings (
        player_registration_enabled,
        team_registration_enabled
      )
    `)
    .eq('is_public', true)
    .in('status', ['REGISTRATION', 'PREPARATION', 'LIVE', 'COMPLETED']);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

run();
