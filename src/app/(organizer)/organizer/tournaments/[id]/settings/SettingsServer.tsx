/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SettingsForm } from './SettingsForm';

export async function SettingsServer({ tournament }: { tournament: any }) {
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('tournament_settings')
    .select('*')
    .eq('tournament_id', tournament.id)
    .single();

  if (!settings) {
    notFound();
  }

  return <SettingsForm tournament={tournament} initialSettings={settings} />;
}
