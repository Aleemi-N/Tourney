import Link from 'next/link';
import { cardClasses } from '@/components/ui/Card';

export type StatsTotals = {
  played: number; won: number; lost: number; drawn: number;
  sets_for: number; sets_against: number; points_for: number; points_against: number; tournaments: number;
};
export type StatsRow = Omit<StatsTotals, 'tournaments'> & { tournament_id: string; name: string; slug: string };
export type Stats = { totals: StatsTotals; tournaments: StatsRow[] };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Totals and a per-tournament breakdown, shared by the public team and player pages. */
export function StatsView({ stats }: { stats: Stats }) {
  const { totals } = stats;
  const winRate = totals.played ? Math.round((totals.won / totals.played) * 100) : 0;
  const tiles: Array<[string, string | number]> = [
    ['Matches', totals.played],
    ['Won', totals.won],
    ['Lost', totals.lost],
    ['Drawn', totals.drawn],
    ['Win rate', `${winRate}%`],
    ['Sets', `${totals.sets_for}–${totals.sets_against}`],
    ['Points', `${totals.points_for}–${totals.points_against}`],
    ['Point diff', signed(totals.points_for - totals.points_against)],
  ];
  return (
    <div className="space-y-6">
      {totals.played === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-secondary">No completed matches yet.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div key={label} className={`${cardClasses} p-4`}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-text-muted">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          <section aria-labelledby="by-tournament" className={`${cardClasses} overflow-x-auto`}>
            <h2 id="by-tournament" className="px-4 pt-4 text-sm font-semibold text-text-secondary">By tournament</h2>
            <table className="mt-2 w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-text-muted">
                  <th scope="col" className="px-4 py-2 font-semibold">Tournament</th>
                  {['P', 'W', 'D', 'L', 'Sets', 'Points'].map((h) => <th key={h} scope="col" className="px-2 py-2 text-center font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {stats.tournaments.map((row) => (
                  <tr key={row.tournament_id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold"><Link href={`/t/${row.slug}`} className="text-primary hover:underline">{row.name}</Link></td>
                    <td className="px-2 text-center tabular-nums">{row.played}</td>
                    <td className="px-2 text-center tabular-nums">{row.won}</td>
                    <td className="px-2 text-center tabular-nums">{row.drawn}</td>
                    <td className="px-2 text-center tabular-nums">{row.lost}</td>
                    <td className="px-2 text-center tabular-nums">{row.sets_for}–{row.sets_against}</td>
                    <td className="px-2 text-center tabular-nums">{row.points_for}–{row.points_against}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
