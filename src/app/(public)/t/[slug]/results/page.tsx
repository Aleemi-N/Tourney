import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import { Trophy } from 'lucide-react';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'results');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Results';
  const description = meta.description ?? 'Match results and scores.';
  const canonical = new URL(`/t/${slug}/results`, TOURNY_PRODUCTION_ORIGIN);
  return {
    ...meta,
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      ...meta.openGraph,
      title: { absolute: title },
      description,
      url: canonical,
      siteName: 'Tourny',
    },
  };
}

export default async function PublicResultsPage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();

  const { data: results } = await supabase
    .from('public_fixture_view')
    .select('id,match_number,status,home_team_id,away_team_id,total_home_score,total_away_score,home_sets_won,away_sets_won,winner_team_id,result_type')
    .eq('tournament_id', tournament.id)
    .eq('status', 'COMPLETED')
    .order('match_number', { ascending: false });

  const ids = [...new Set(
    (results ?? []).flatMap((r) => [r.home_team_id, r.away_team_id]).filter(Boolean)
  )];
  const { data: teams } = ids.length
    ? await supabase.from('public_team_view').select('id,name,short_name').in('id', ids)
    : { data: [] };

  const teamName = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? 'TBD';
  const teamShort = (id: string | null) => {
    const t = teams?.find((t) => t.id === id);
    return (t?.short_name ?? t?.name ?? 'TBD').slice(0, 3).toUpperCase();
  };

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-8">
        <p className="text-primary text-xs font-bold uppercase tracking-[0.2em]">
          Completed matches
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Results</h1>
      </div>

      {(!results || results.length === 0) ? (
        <EmptyState text="Match results will appear here once games are completed." />
      ) : (
        <div className="space-y-3">
          {results.map((result) => {
            const homeWon = result.winner_team_id === result.home_team_id;
            const awayWon = result.winner_team_id === result.away_team_id;
            const homeScore = result.total_home_score ?? 0;
            const awayScore = result.total_away_score ?? 0;
            const homeSets = Number(result.home_sets_won ?? 0);
            const awaySets = Number(result.away_sets_won ?? 0);

            return (
              <article
                key={result.id}
                className="rounded-2xl p-5 border border-border bg-surface shadow-card"
              >
                <p className="text-text-muted mb-4 text-xs font-bold uppercase tracking-wider">
                  Match {result.match_number ?? '—'}
                  {result.result_type === 'WALKOVER' ? ' · Walkover' : result.result_type === 'DRAW' ? ' · Draw' : ''}
                </p>

                <div className="space-y-3">
                  {/* Home row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                    >
                      {teamShort(result.home_team_id)}
                    </div>
                    <span className={`flex-1 text-sm font-bold ${homeWon ? '' : 'opacity-60'}`}>
                      {teamName(result.home_team_id)}
                    </span>
                    {homeWon && (
                      <Trophy className="text-warning h-4 w-4 shrink-0" />
                    )}
                    <span
                      className={`text-xl font-black tabular-nums ${homeWon ? 'text-text-primary' : 'text-text-muted'}`}
                    >
                      {homeSets}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border" />

                  {/* Away row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                    >
                      {teamShort(result.away_team_id)}
                    </div>
                    <span className={`flex-1 text-sm font-bold ${awayWon ? '' : 'opacity-60'}`}>
                      {teamName(result.away_team_id)}
                    </span>
                    {awayWon && (
                      <Trophy className="text-warning h-4 w-4 shrink-0" />
                    )}
                    <span
                      className={`text-xl font-black tabular-nums ${awayWon ? 'text-text-primary' : 'text-text-muted'}`}
                    >
                      {awaySets}
                    </span>
                  </div>
                </div>

                {/* Score footer */}
                <div className="text-text-muted mt-4 flex items-center gap-3 text-xs">
                  <span>Total points: {homeScore} – {awayScore}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PublicTournamentFrame>
  );
}