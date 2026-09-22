import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRightIcon, TrophyIcon } from './icons';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';

export async function DashboardTournamentsServer({ userId }: { userId: string }) {
  const supabase = await createClient();

  interface TournamentItem {
    id: string;
    name: string;
    status: string;
    format: string;
    start_date: string | null;
  }

  const [{ data: memberships }, { data: createdTournaments }] = await Promise.all([
    supabase
      .from('tournament_members')
      .select('tournament_id')
      .eq('user_id', userId)
      .eq('role', 'ORGANIZER')
      .eq('status', 'ACTIVE'),
    supabase
      .from('tournaments')
      .select('id, name, status, format, start_date')
      .eq('created_by', userId)
      .order('created_at', { ascending: false }),
  ]);

  const memberTournamentIds = [...new Set((memberships || []).map((membership) => membership.tournament_id))];
  const { data: memberTournaments } = memberTournamentIds.length
    ? await supabase.from('tournaments').select('id, name, status, format, start_date').in('id', memberTournamentIds).order('created_at', { ascending: false })
    : { data: [] };

  const tournamentMap = new Map<string, TournamentItem>();
  [...(createdTournaments || []), ...(memberTournaments || [])].forEach((tournament) => tournamentMap.set(tournament.id, tournament as TournamentItem));
  const tournaments = [...tournamentMap.values()];

  if (tournaments.length === 0) {
    const { data: organizationMembership } = await supabase.from('organization_members').select('organization_id').eq('user_id', userId).eq('status', 'ACTIVE').limit(1);
    if (!organizationMembership?.length) redirect('/organizer/onboarding');
  }

  if (tournaments.length === 0) {
    return (
      <div className="bg-surface border border-border border-dashed rounded-2xl p-12 text-center">
        <div className="mx-auto w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
          <TrophyIcon className="w-8 h-8 text-text-muted" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">No Tournaments Yet</h2>
        <p className="text-text-secondary mb-6 max-w-md mx-auto">
          You haven&apos;t created any tournaments yet. Get started by creating your first volleyball tournament.
        </p>
        <Link
          href="/organizer/tournaments/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors"
        >
          Create Tournament
        </Link>
      </div>
    );
  }

  const drafts = tournaments.filter(t => t.status === 'DRAFT');
  const activeTournamentsRaw = tournaments.filter(t => t.status !== 'DRAFT');

  const activeTournaments = await Promise.all(
    activeTournamentsRaw.map(async (t) => {
      const [{ count: playerCount }, { count: teamOwnerCount }, { count: teamCount }] = await Promise.all([
        supabase.from('player_tournament_registrations').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id),
        supabase.from('team_owner_applications').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id),
        supabase.from('teams').select('*', { count: 'exact', head: true }).eq('tournament_id', t.id)
      ]);
      return {
        ...t,
        counts: {
          players: playerCount || 0,
          applications: teamOwnerCount || 0,
          teams: teamCount || 0
        }
      };
    })
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Priority Strip / Drafts */}
      {drafts.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            Drafts in Progress
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {drafts.map((draft) => (
              <Link 
                key={draft.id} 
                href={`/organizer/tournaments/new?id=${draft.id}`}
                className="bg-surface border border-border p-5 rounded-xl hover:shadow-md transition-shadow group flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                      {draft.name || 'Untitled Tournament'}
                    </h3>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-surface-muted text-text-secondary rounded">
                      Draft
                    </span>
                  </div>
                  <p className="text-sm text-text-secondary mb-4">
                    {draft.format ? draft.format.replace('_', ' ') : 'Format not set'}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary flex items-center gap-1 group-hover:underline">
                  Continue Setup <ArrowRightIcon className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active/Completed Tournaments */}
      <section>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Your Tournaments</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTournaments.map((tournament) => (
            <Link 
              key={tournament.id as string} 
              href={`/organizer/tournaments/${tournament.id}`}
              className="relative bg-surface border border-border p-5 rounded-xl hover:shadow-md transition-shadow group"
            >
              <OrganizerLinkPending className="absolute right-3 bottom-3 text-primary" />
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors">
                    {tournament.name}
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-primary/10 text-primary rounded">
                  {tournament.status}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm text-text-secondary mt-4">
                <span className="flex justify-between">
                  <span>Format</span>
                  <span className="font-medium text-text-primary">{tournament.format?.replace('_', ' ')}</span>
                </span>
                <span className="flex justify-between mt-1">
                  <span>Players</span>
                  <span className="font-medium text-text-primary">{tournament.counts.players}</span>
                </span>
                <span className="flex justify-between mt-1">
                  <span>Applications</span>
                  <span className="font-medium text-text-primary">{tournament.counts.applications}</span>
                </span>
                <span className="flex justify-between mt-1">
                  <span>Teams</span>
                  <span className="font-medium text-text-primary">{tournament.counts.teams}</span>
                </span>
                {tournament.start_date && (
                  <span className="flex justify-between mt-1 pt-1 border-t border-border">
                    <span>Date</span>
                    <span className="font-medium text-text-primary">
                      {new Date(tournament.start_date).toLocaleDateString()}
                    </span>
                  </span>
                )}
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:underline">Open Dashboard <ArrowRightIcon className="h-4 w-4" /></span>
            </Link>
          ))}
        </div>
        {activeTournaments.length === 0 && (
          <p className="text-text-secondary text-sm">No published tournaments found.</p>
        )}
      </section>
    </div>
  );
}
