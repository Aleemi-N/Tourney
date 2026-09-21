import { createClient, getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

import { RegistrationLinks } from './RegistrationLinks';

export const dynamic = 'force-dynamic';

export default async function TournamentManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  
  // Use cached tournament lookup (shared with layout)
  const { data: tournament } = await getTournament(id);

  if (!tournament) {
    notFound();
  }

  // 4. Fetch counts
  console.time('OverviewPage getCounts');
  const [{ count: playerCount }, { count: teamOwnerCount }, { count: teamCount }] = await Promise.all([
    supabase.from('player_tournament_registrations').select('*', { count: 'exact', head: true }).eq('tournament_id', id),
    supabase.from('team_owner_applications').select('*', { count: 'exact', head: true }).eq('tournament_id', id),
    supabase.from('teams').select('*', { count: 'exact', head: true }).eq('tournament_id', id)
  ]);
  console.timeEnd('OverviewPage getCounts');

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto h-full">
      <Link href="/organizer/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-primary transition-colors mb-6">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Dashboard
      </Link>
      
      <div className="bg-surface rounded-2xl border border-border p-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">{tournament.name as string}</h1>
            <p className="text-text-secondary">/{tournament.slug as string}</p>
          </div>
          <span className="px-3 py-1 bg-primary/10 text-primary font-bold tracking-wider text-xs uppercase rounded">
            {tournament.status as string}
          </span>
        </div>
        
        <p className="text-text-secondary mb-8">
          Manage your tournament settings, participants, and live action from this dashboard.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-muted p-4 rounded-xl border border-border">
            <p className="text-sm font-medium text-text-secondary">Registered Players</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{playerCount || 0}</p>
          </div>
          <div className="bg-surface-muted p-4 rounded-xl border border-border">
            <p className="text-sm font-medium text-text-secondary">Team Owner Applications</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{teamOwnerCount || 0}</p>
          </div>
          <div className="bg-surface-muted p-4 rounded-xl border border-border">
            <p className="text-sm font-medium text-text-secondary">Approved Teams</p>
            <p className="text-3xl font-bold text-text-primary mt-1">{teamCount || 0}</p>
          </div>
        </div>
      </div>

      <RegistrationLinks 
        slug={tournament.slug as string} 
        isLeague={tournament.format === 'LEAGUE'} 
        status={tournament.status as string}
      />
    </main>
  );
}
