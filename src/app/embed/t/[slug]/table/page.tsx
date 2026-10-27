import type { Metadata } from 'next';
import { EmbedShell } from '@/components/embed/EmbedShell';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { getCanonicalOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Row = { stage_id: string; team_id: string; team_name: string; played: number; won: number; lost: number; league_points: number };

/** Embeddable league table: <iframe src="/embed/t/{slug}/table">. Optional ?theme=light|dark. */
export default async function EmbedTable({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { slug } = await params;
  const { theme } = await searchParams;
  const tournament = await getTournamentHeader(slug);
  const href = `${getCanonicalOrigin()}/t/${slug}/table`;
  if (!tournament) return <EmbedShell theme={theme} title="Tournament not found" href={getCanonicalOrigin()} refreshSeconds={300}><p className="text-sm text-text-muted">This tournament is not public.</p></EmbedShell>;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_public_standings', { p_tournament_id: tournament.id });
  const rows = (data ?? []) as Row[];

  return (
    <EmbedShell theme={theme} title={tournament.name} subtitle="Standings" href={href} refreshSeconds={30}>
      {rows.length === 0 ? <p className="text-sm text-text-muted">Standings appear after the first matches are played.</p> : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <th scope="col" className="py-2 pr-2 text-left">#</th><th scope="col" className="py-2 text-left">Team</th>
              <th scope="col" className="px-2 py-2 text-center" title="Played">P</th><th scope="col" className="px-2 py-2 text-center" title="Won">W</th>
              <th scope="col" className="px-2 py-2 text-center" title="Lost">L</th><th scope="col" className="py-2 pl-2 text-right" title="Points">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.stage_id}-${r.team_id}`} className="border-b border-border last:border-b-0">
                <td className="py-2 pr-2 font-bold text-text-muted">{i + 1}</td>
                <td className="max-w-[12rem] truncate py-2 font-semibold">{r.team_name}</td>
                <td className="px-2 py-2 text-center text-text-secondary">{r.played}</td>
                <td className="px-2 py-2 text-center text-text-secondary">{r.won}</td>
                <td className="px-2 py-2 text-center text-text-secondary">{r.lost}</td>
                <td className="py-2 pl-2 text-right font-extrabold text-primary">{r.league_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </EmbedShell>
  );
}
