import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirect('/login');
  }

  // 2. Fetch Tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, format, league_mode')
    .eq('id', id)
    .single();

  if (!tournament) {
    notFound();
  }

  // 3. Verify Organizer Role
  const { data: membership } = await supabase
    .from('tournament_members')
    .select('role')
    .eq('tournament_id', id)
    .eq('user_id', user.id)
    .single();

  if (membership?.role !== 'ORGANIZER') {
    notFound();
  }

  // 4. Fetch Settings
  const { data: settings } = await supabase
    .from('tournament_settings')
    .select('*')
    .eq('tournament_id', id)
    .single();

  if (!settings) {
    notFound();
  }

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link 
          href={`/organizer/tournaments/${id}`}
          className="inline-flex items-center text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back to Overview
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary mt-1">
          Configure registration and auction rules for {tournament.name}.
        </p>
      </div>

      <SettingsForm tournament={tournament} initialSettings={settings} />
    </main>
  );
}
