import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ShareStandingsButton } from '@/components/organizer/ShareStandingsButton';

type Standing = { rank: number; team_id: string; team_name: string; played: number; won: number; lost: number; league_points: number; sets_won: number; sets_lost: number; points_for: number; points_against: number };

export default async function OrganizerStandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tournament }, { data: stages }] = await Promise.all([
    supabase.from('tournaments').select('id,name,slug').eq('id', id).maybeSingle(),
    supabase.from('tournament_stages').select('id,name,status,sequence,qualification_count').eq('tournament_id', id).eq('stage_type', 'LEAGUE').order('sequence'),
  ]);
  if (!tournament) notFound();
  const tables = await Promise.all((stages ?? []).map(async (stage) => {
    const { data } = await supabase.rpc('get_stage_standings', { p_stage_id: stage.id });
    return { stage, rows: (Array.isArray(data) ? data : []) as unknown as Standing[] };
  }));
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const th = 'px-1 py-3 text-center font-bold sm:px-2';
  const wide = 'hidden sm:table-cell';
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <p className="text-sm text-text-secondary">{tournament.name}</p>
      <h1 className="mt-2 text-3xl font-black text-text-primary">Standings</h1>
      <p className="mt-3 text-text-secondary">Authoritative league rankings using the saved points and tie-break rules.</p>
      <div className="mt-8 space-y-8">
        {tables.map(({ stage, rows }) => {
          const q = stage.qualification_count ?? 0;
          return (
            <section key={stage.id}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">{stage.name}</h2>
                  <p className="text-sm text-text-muted">{stage.status}{q ? ` · Top ${q} qualify` : ''}</p>
                </div>
                {rows.length ? <ShareStandingsButton tournament={{ name: tournament.name, slug: tournament.slug }} stage={stage} rows={rows} /> : null}
              </div>
              {rows.length ? (
                <>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface">
                    <table className="w-full text-sm tabular-nums">
                      <thead className="bg-surface-muted text-[11px] uppercase tracking-wider text-text-muted">
                        <tr>
                          <th className="w-11 py-3 pl-3 text-left font-bold">#</th>
                          <th className="py-3 pl-2 text-left font-bold">Team</th>
                          <th className={th}>P</th>
                          <th className={th}>W</th>
                          <th className={th}>L</th>
                          <th className={`${th} ${wide}`}>Sets</th>
                          <th className={th} title="Set difference">+/-</th>
                          <th className={`${th} ${wide}`}>Points</th>
                          <th className={`${th} ${wide}`}>PD</th>
                          <th className="py-3 pl-1 pr-3 text-right sm:pr-4 font-bold">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const qualified = row.rank <= q;
                          const cutoff = q > 0 && row.rank === q && q < rows.length;
                          return (
                            <tr key={row.team_id} className={`border-t border-border ${qualified ? 'bg-primary/5' : ''} ${cutoff ? 'border-b-2 border-b-primary/50 border-dashed' : ''}`}>
                              <td className="py-3 pl-3">
                                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${qualified ? 'bg-primary text-primary-foreground' : 'bg-surface-muted text-text-secondary'}`}>{row.rank}</span>
                              </td>
                              <td className="w-full max-w-0 truncate py-3 pl-2 pr-1 font-bold text-text-primary">{row.team_name}</td>
                              <td className="px-1 text-center sm:px-2 text-text-secondary">{row.played}</td>
                              <td className="px-1 text-center sm:px-2 text-text-secondary">{row.won}</td>
                              <td className="px-1 text-center sm:px-2 text-text-secondary">{row.lost}</td>
                              <td className={`px-2 text-center text-text-secondary ${wide}`}>{row.sets_won}-{row.sets_lost}</td>
                              <td className="px-1 text-center sm:px-2 text-text-secondary">{signed(row.sets_won - row.sets_lost)}</td>
                              <td className={`px-2 text-center text-text-secondary ${wide}`}>{row.points_for}-{row.points_against}</td>
                              <td className={`px-2 text-center text-text-secondary ${wide}`}>{signed(row.points_for - row.points_against)}</td>
                              <td className="py-3 pl-1 pr-3 text-right text-base sm:pr-4 font-black text-primary">{row.league_points}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {q ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
                      <span className="h-3 w-3 rounded-full bg-primary" /> Qualifies for the next stage<span className="sm:hidden"> · +/- = set difference</span>
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-text-secondary">Standings will appear after league matches begin.</p>
              )}
            </section>
          );
        })}
        {tables.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-text-secondary">No league stage has been configured yet. Set up competition structure under Fixtures.</p> : null}
      </div>
    </main>
  );
}
