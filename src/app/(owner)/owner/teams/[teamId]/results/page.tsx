import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';

export const metadata: Metadata = { title: 'Match Results | Team Owner' };

export default async function OwnerResultsPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const api = await createClient();
    const { data: { user } } = await api.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(api, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const { data: results } = await api
        .from('public_fixture_view')
        .select('id,match_number,scheduled_at,venue,court,status,home_team_id,away_team_id,total_home_score,total_away_score,winner_team_id')
        .eq('tournament_id', team.tournament_id)
        .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
        .in('status', ['COMPLETED', 'FINAL'])
        .order('scheduled_at', { ascending: false });

    const ids = [...new Set((results ?? []).flatMap((res) => [res.home_team_id, res.away_team_id]).filter((id): id is string => Boolean(id)))];
    const { data: names } = ids.length ? await api.from('teams').select('id,name').in('id', ids) : { data: [] };
    const getTeamName = (id: string | null) => names?.find((item) => item.id === id)?.name ?? 'TBD';

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-5 py-8 sm:px-8 lg:px-12">
                <div className="mx-auto max-w-6xl">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Match History</p>
                    <h1 className="mt-2 text-3xl font-black text-text-primary sm:text-4xl">Results</h1>
                    <p className="mt-1 text-sm text-text-secondary">Authoritative match scores and results for {team.name}.</p>

                    <div className="mt-6 space-y-3">
                        {results?.map((res) => {
                            const isHome = res.home_team_id === team.id;
                            const isWinner = res.winner_team_id === team.id;

                            return (
                                <article key={res.id} className="rounded-2xl border border-border bg-surface p-5">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                                                    Match {res.match_number ?? '—'}
                                                </span>
                                                {res.winner_team_id ? (
                                                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold uppercase ${
                                                        isWinner
                                                            ? 'border-success/30 bg-success/10 text-success'
                                                            : 'border-danger/30 bg-danger/10 text-danger'
                                                    }`}>
                                                        {isWinner ? 'WON' : 'LOST'}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <h3 className="mt-2 text-lg font-black text-text-primary flex items-center gap-3">
                                                <span className={isHome ? 'text-text-primary' : 'text-text-secondary'}>
                                                    {getTeamName(res.home_team_id)}
                                                </span>
                                                <span className="text-primary font-mono">
                                                    {res.total_home_score ?? 0} - {res.total_away_score ?? 0}
                                                </span>
                                                <span className={!isHome ? 'text-text-primary' : 'text-text-secondary'}>
                                                    {getTeamName(res.away_team_id)}
                                                </span>
                                            </h3>
                                        </div>
                                        <p className="text-sm text-text-muted">
                                            {res.scheduled_at ? new Date(res.scheduled_at).toLocaleDateString('en-IN') : 'Completed'}
                                        </p>
                                    </div>
                                </article>
                            );
                        })}
                        {(!results || results.length === 0) && (
                            <div className="rounded-3xl border border-dashed border-border-strong bg-surface p-8 text-sm text-text-secondary">
                                No completed match results recorded for this team yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
