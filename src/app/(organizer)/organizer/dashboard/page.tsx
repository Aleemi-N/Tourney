import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/24/outline';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Organizer Dashboard' };
export const dynamic = 'force-dynamic';

export default async function OrganizerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return null; // redirect handled in proxy
  }

  // Get tournaments for the user's organization
  // Since a user might have multiple organizations, we'll get their organizations first
  const { data: orgs } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = orgs?.map((o) => o.organization_id) || [];

  if (orgIds.length === 0) {
    redirect('/organizer/onboarding');
  }

  interface TournamentItem {
    id: string;
    name: string;
    status: string;
    format: string;
    start_date: string | null;
  }

  let tournaments: TournamentItem[] = [];
  if (orgIds.length > 0) {
    const { data } = await supabase
      .from('tournaments')
      .select('id, name, status, format, start_date')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });
    
    
    tournaments = (data || []) as TournamentItem[];
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
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-text-secondary mt-1">Manage your tournaments and events.</p>
        </div>
        <Link
          href="/organizer/tournaments/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Create Tournament
        </Link>
      </div>

      {tournaments.length === 0 ? (
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
      ) : (
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
                  className="bg-surface border border-border p-5 rounded-xl hover:shadow-md transition-shadow group"
                >
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
                </Link>
              ))}
            </div>
            {activeTournaments.length === 0 && (
              <p className="text-text-secondary text-sm">No published tournaments found.</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

// Temporary icon placeholders to keep imports clean
function TrophyIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
    </svg>
  );
}

function ArrowRightIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
