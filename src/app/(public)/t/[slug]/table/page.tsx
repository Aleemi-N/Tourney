import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';

type Props = { params: Promise<{ slug: string }> };

type StandingsRow = {
  stage_id: string;
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  league_points: number;
  sets_won: number;
  sets_lost: number;
  points_for: number;
  points_against: number;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentHeader(slug);
  if (!t) return { title: 'Tournament Not Found | Tourny', robots: { index: false, follow: false } };
  const title = `${t.name} — Standings`;
  const description = `League table and standings for ${t.name}.`;
  const canonical = new URL(`/t/${slug}/table`, TOURNY_PRODUCTION_ORIGIN);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: { title: { absolute: title }, description, url: canonical, siteName: 'Tourny' },
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
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>
          League table
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Standings</h1>
      </div>

      {rows.length === 0 ? (
        <EmptyState text="Standings will appear after completed league matches." />
      ) : (
        <div
          className="overflow-x-auto rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <table className="min-w-full text-left">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[
                  { key: '#',     tip: 'Position' },
                  { key: 'Team',  tip: 'Team' },
                  { key: 'P',     tip: 'Played' },
                  { key: 'W',     tip: 'Won' },
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
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider"
                    style={{ color: 'rgba(255,255,255,0.35)' }}
                  >
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isTopThree = index < 3;
                const rankColors = ['#fbbf24', '#94a3b8', '#c2966d'];
                return (
                  <tr
                    key={`${row.stage_id}-${row.team_id}`}
                    className="transition-colors"
                    style={{
                      borderBottom: index < rows.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    {/* Rank */}
                    <td className="px-4 py-3.5 tabular-nums">
                      <span
                        className="text-sm font-black"
                        style={{ color: isTopThree ? rankColors[index] : 'rgba(255,255,255,0.3)' }}
                      >
                        {index + 1}
                      </span>
                    </td>
                    {/* Team */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                          style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                        >
                          {row.team_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-bold whitespace-nowrap">{row.team_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.played}</td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(74,222,128,0.8)' }}>{row.won}</td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(248,113,113,0.8)' }}>{row.lost}</td>
                    {/* Points — highlighted */}
                    <td className="px-4 py-3.5">
                      <span
                        className="rounded-lg px-2.5 py-1 text-sm font-black tabular-nums"
                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                      >
                        {row.league_points}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.sets_won}</td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.sets_lost}</td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.points_for}</td>
                    <td className="px-4 py-3.5 text-sm tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>{row.points_against}</td>
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