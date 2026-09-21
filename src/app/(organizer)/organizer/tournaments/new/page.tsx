import { createClient, getUser } from '@/lib/supabase/server';
import { TournamentWizard } from '@/components/organizer/wizard/TournamentWizard';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Create Tournament' };

export default async function NewTournamentPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const supabase = await createClient();
  console.time('Page auth');
  const { data: { user } } = await getUser();
  console.timeEnd('Page auth');

  if (!user) {
    redirect('/login');
  }

  // Check if they have an organization
  console.time('Profile/org lookup');
  const { data: orgs } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);
  console.timeEnd('Profile/org lookup');

  if (!orgs || orgs.length === 0) {
    redirect('/organizer/onboarding?next=/organizer/tournaments/new');
  }

  const params = await searchParams;
  let draftData = null;

  if (params.id) {
    // Fetch draft data
    console.time('Tournament fetch');
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', params.id)
      .eq('created_by', user!.id) // security check
      .single();
    console.timeEnd('Tournament fetch');

    if (tournament) {
      // Fetch settings
      console.time('Rules/settings fetch');
      const { data: settings } = await supabase
        .from('tournament_settings')
        .select('*')
        .eq('tournament_id', tournament.id)
        .single();
      
      // Fetch rules
      const { data: rules } = await supabase
        .from('volleyball_rules')
        .select('*')
        .eq('tournament_id', tournament.id)
        .is('stage_id', null)
        .single();
      console.timeEnd('Rules/settings fetch');

      draftData = {
        ...tournament,
        settings: settings || {},
        volleyball_rules: rules || {},
      };
    }
  }

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto h-full">
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        {draftData ? 'Resume Tournament Setup' : 'Create New Tournament'}
      </h1>
      <TournamentWizard initialData={draftData} />
    </main>
  );
}
