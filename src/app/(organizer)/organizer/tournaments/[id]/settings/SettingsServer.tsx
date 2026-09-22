/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SettingsForm } from './SettingsForm';
import { TournamentDetailsForm } from './TournamentDetailsForm';
import { RulesAndStages } from './RulesAndStages';
import type { Phase5Configuration } from './SettingsForm';

export async function SettingsServer({ tournament }: { tournament: any }) {
  const supabase = await createClient();

  const [{ data: settings }, { data: branding }, { data: phase5Configuration }] = await Promise.all([
    supabase.from('tournament_settings').select('*').eq('tournament_id', tournament.id).single(),
    supabase.from('tournament_branding').select('logo_path').eq('tournament_id', tournament.id).maybeSingle(),
    supabase.rpc('get_tournament_phase5a_configuration', { p_tournament_id: tournament.id }),
  ]);

  if (!settings || !phase5Configuration) {
    notFound();
  }

  const logoPath = branding?.logo_path ?? null;
  const logoUrl = logoPath ? supabase.storage.from('logos').getPublicUrl(logoPath).data.publicUrl : null;

  return (
    <div className="space-y-8">
      <TournamentDetailsForm tournament={tournament} initialLogoPath={logoPath} initialLogoUrl={logoUrl} />
      <SettingsForm tournament={tournament} configuration={phase5Configuration as unknown as Phase5Configuration} />
      <RulesAndStages
        tournamentId={tournament.id}
        stages={(phase5Configuration as unknown as Phase5Configuration).stages}
        rules={(phase5Configuration as unknown as Phase5Configuration).rules}
      />
    </div>
  );
}
