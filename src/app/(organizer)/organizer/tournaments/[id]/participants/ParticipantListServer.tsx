/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { ParticipantManager } from './ParticipantManager';

export async function ParticipantListServer({ 
  tournament 
}: { 
  tournament: any 
}) {
  const supabase = await createClient();

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
      .eq('tournament_id', tournament.id)
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
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false })
  ]);
  console.timeEnd('ParticipantPage concurrentQueries');

  return (
    <ParticipantManager 
      tournament={tournament} 
      players={players || []} 
      teamOwners={teamOwners || []} 
    />
  );
}
