import { createClient } from '@/lib/supabase/server';

export async function TournamentStatsServer({ tournamentId }: { tournamentId: string }) {
  const supabase = await createClient();

  const [
    { count: playerCount, error: playerError },
    { count: teamOwnerCount, error: teamOwnerError },
    { count: teamCount, error: teamError }
  ] = await Promise.all([
    supabase.from('player_tournament_registrations').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    supabase.from('team_owner_applications').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    supabase.from('teams').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
  ]);

  if (playerError || teamOwnerError || teamError) {
    const err = playerError || teamOwnerError || teamError;
    console.error('TournamentStats query error:', err);
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl text-center md:col-span-3">
        <p className="font-semibold">Unable to load statistics</p>
        <p className="text-sm mt-1">Please try refreshing the page or logging in again.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-surface-muted p-4 rounded-xl border border-border">
        <p className="text-sm font-medium text-text-secondary">Registered Players</p>
        <p className="text-3xl font-bold text-text-primary mt-1">{playerCount ?? 0}</p>
      </div>
      <div className="bg-surface-muted p-4 rounded-xl border border-border">
        <p className="text-sm font-medium text-text-secondary">Team Owner Applications</p>
        <p className="text-3xl font-bold text-text-primary mt-1">{teamOwnerCount ?? 0}</p>
      </div>
      <div className="bg-surface-muted p-4 rounded-xl border border-border">
        <p className="text-sm font-medium text-text-secondary">Approved Teams</p>
        <p className="text-3xl font-bold text-text-primary mt-1">{teamCount ?? 0}</p>
      </div>
    </div>
  );
}
