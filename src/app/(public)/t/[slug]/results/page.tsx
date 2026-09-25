import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import { Trophy } from 'lucide-react';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentHeader(slug);
  if (!t) return { title: 'Tournament Not Found | Tourny', robots: { index: false, follow: false } };
  const title = `${t.name} — Results`;
  const description = `Match results and scores from ${t.name}.`;
  const canonical = new URL(`/t/${slug}/results`, TOURNY_PRODUCTION_ORIGIN);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title: { absolute: title }, description, url: canonical, siteName: 'Tourny' },
  };
}

export default async function PublicResultsPage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();

  const { data: results } = await supabase
    .from('public_fixture_view')
    .select('id,match_number,status,home_team_id,away_team_id,total_home_score,total_away_score,home_sets_won,away_sets_won,winner_team_id')
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
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>
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
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <p className="mb-4 text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Match {result.match_number ?? '—'}
                </p>

                <div className="space-y-3">
                  {/* Home row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                    >
                      {teamShort(result.home_team_id)}
                    </div>
                    <span className={`flex-1 text-sm font-bold ${homeWon ? '' : 'opacity-60'}`}>
                      {teamName(result.home_team_id)}
                    </span>
                    {homeWon && (
                      <Trophy className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />
                    )}
                    <span
                      className="text-xl font-black tabular-nums"
                      style={{ color: homeWon ? '#f0f0f4' : 'rgba(255,255,255,0.45)' }}
                    >
                      {homeSets}
                    </span>
                  </div>

                  {/* Divider */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }} />

                  {/* Away row */}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                      style={{ background: 'rgba(168,85,247,0.15)', color: '#c4b5fd' }}
                    >
                      {teamShort(result.away_team_id)}
                    </div>
                    <span className={`flex-1 text-sm font-bold ${awayWon ? '' : 'opacity-60'}`}>
                      {teamName(result.away_team_id)}
                    </span>
                    {awayWon && (
                      <Trophy className="h-4 w-4 shrink-0" style={{ color: '#fbbf24' }} />
                    )}
                    <span
                      className="text-xl font-black tabular-nums"
                      style={{ color: awayWon ? '#f0f0f4' : 'rgba(255,255,255,0.45)' }}
                    >
                      {awaySets}
                    </span>
                  </div>
                </div>

                {/* Score footer */}
                <div className="mt-4 flex items-center gap-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
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