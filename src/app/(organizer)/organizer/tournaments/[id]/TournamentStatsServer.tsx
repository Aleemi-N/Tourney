import { createClient } from '@/lib/supabase/server';

export async function TournamentStatsServer({ tournamentId }: { tournamentId: string }) {
  const supabase = await createClient();

  const [{ count: playerCount }, { count: teamOwnerCount }, { count: teamCount }] = await Promise.all([
    supabase.from('player_tournament_registrations').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    supabase.from('team_owner_applications').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId),
    supabase.from('teams').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)
  ]);

  return (
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
  );
}
