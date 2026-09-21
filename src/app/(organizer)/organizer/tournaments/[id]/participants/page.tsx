import { createClient, getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ParticipantManager } from './ParticipantManager';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export const dynamic = 'force-dynamic';

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch tournament from cache
  const { data: tournament } = await getTournament(id);
  if (!tournament) {
    notFound();
  }

  // Fetch player registrations and team owner applications concurrently
  console.time('ParticipantPage concurrentQueries');
  const [
    { data: players },
    { data: teamOwners }
  ] = await Promise.all([
    supabase
      .from('player_tournament_registrations')
      .select(`
        id,
        status,
        auction_category,
        player_profiles (
          id,
          display_name,
          primary_position,
          secondary_position,
          photo_path,
          place,
          height_cm
        )
      `)
      .eq('tournament_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('team_owner_applications')
      .select(`
        id,
        proposed_team_name,
        team_short_name,
        logo_path,
        place,
        status,
        profiles:user_id (
          full_name
        )
      `)
      .eq('tournament_id', id)
      .order('created_at', { ascending: false })
  ]);
  console.timeEnd('ParticipantPage concurrentQueries');

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen">
      <div className="mb-6 flex flex-col gap-2">
        <Link 
          href={`/organizer/tournaments/${id}`}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors w-fit"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Tournament
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Participant Management</h1>
          <p className="text-slate-500 mt-1">{tournament.name}</p>
        </div>
      </div>

      <ParticipantManager 
        tournament={tournament} 
        players={players || []} 
        teamOwners={teamOwners || []} 
      />
    </div>
  );
}
