import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';

type Props = { params: Promise<{ slug: string }> };

type StandingsRow = {
  stage_id: string;
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  league_points: number;
  sets_won: number;
  sets_lost: number;
  points_for: number;
  points_against: number;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'table');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Standings';
  const description = meta.description ?? 'League table and standings.';
  const canonical = new URL(`/t/${slug}/table`, TOURNY_PRODUCTION_ORIGIN);
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

export default async function PublicTablePage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();
  const { data: standings } = await supabase.rpc('get_public_standings', { p_tournament_id: tournament.id });
  const rows = (standings ?? []) as StandingsRow[];

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-8">
        <p className="text-primary text-xs font-bold uppercase tracking-[0.2em]">
          League table
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Standings</h1>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Standings will appear after completed league matches." />
      ) : (
        <div
          className="border border-border bg-surface overflow-x-auto rounded-2xl"
        >
          <table className="min-w-full text-left">
            <thead>
              <tr className="border-b border-border">
                {[
                  { key: '#',     tip: 'Position' },
                  { key: 'Team',  tip: 'Team' },
                  { key: 'P',     tip: 'Played' },
                  { key: 'W',     tip: 'Won' },
                  { key: 'D',     tip: 'Drawn' },
                  { key: 'L',     tip: 'Lost' },
                  { key: 'Pts',   tip: 'Points' },
                  { key: 'SW',    tip: 'Sets Won' },
                  { key: 'SL',    tip: 'Sets Lost' },
                  { key: 'PF',    tip: 'Points For' },
                  { key: 'PA',    tip: 'Points Against' },
                ].map(({ key, tip }) => (
                  <th
                    key={key}
                    title={tip}
                    scope="col"
                    className="text-text-muted px-4 py-3 text-xs font-bold uppercase tracking-wider"
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isTopThree = index < 3;
                const rankColors = ['text-warning', 'text-text-secondary', 'text-warning'];
                return (
                  <tr
                    key={`${row.stage_id}-${row.team_id}`}
                    className="border-b border-border transition-colors last:border-b-0"
                  >
                    {/* Rank */}
                    <td className="px-4 py-3.5 tabular-nums">
                      <span className={`text-sm font-black ${isTopThree ? rankColors[index] : 'text-text-muted'}`}>
                        {index + 1}
                      </span>
                    </td>
                    {/* Team */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                        >
                          {row.team_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold whitespace-nowrap">{row.team_name}</span>
                      </div>
                    </td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.played}</td>
                    <td className="text-success px-4 py-3.5 text-sm tabular-nums">{row.won}</td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.drawn}</td>
                    <td className="text-danger px-4 py-3.5 text-sm tabular-nums">{row.lost}</td>
                    {/* Points — highlighted */}
                    <td className="px-4 py-3.5">
                      <span
                        className="bg-primary/10 text-primary rounded-lg px-2.5 py-1 text-sm font-black tabular-nums"
                      >
                        {row.league_points}
                      </span>
                    </td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.sets_won}</td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.sets_lost}</td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.points_for}</td>
                    <td className="text-text-secondary px-4 py-3.5 text-sm tabular-nums">{row.points_against}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PublicTournamentFrame>
  );
}