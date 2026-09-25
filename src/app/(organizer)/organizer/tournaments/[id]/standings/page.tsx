import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

type Standing = { rank: number; team_id: string; team_name: string; played: number; won: number; lost: number; league_points: number; sets_won: number; sets_lost: number; points_for: number; points_against: number };

export default async function OrganizerStandingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tournament }, { data: stages }] = await Promise.all([
    supabase.from('tournaments').select('id,name').eq('id', id).maybeSingle(),
    supabase.from('tournament_stages').select('id,name,status,sequence,qualification_count').eq('tournament_id', id).eq('stage_type', 'LEAGUE').order('sequence'),
  ]);
  if (!tournament) notFound();
  const tables = await Promise.all((stages ?? []).map(async (stage) => {
    const { data } = await supabase.rpc('get_stage_standings', { p_stage_id: stage.id });
    return { stage, rows: (Array.isArray(data) ? data : []) as unknown as Standing[] };
  }));
  return <main className="mx-auto max-w-6xl p-5 sm:p-8"><p className="text-sm text-text-secondary">{tournament.name}</p><h1 className="mt-2 text-3xl font-black text-text-primary">Standings</h1><p className="mt-3 text-text-secondary">Authoritative league rankings using the saved points and tie-break rules.</p><div className="mt-8 space-y-8">{tables.map(({ stage, rows }) => <section key={stage.id}><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{stage.name}</h2><p className="text-sm text-text-muted">{stage.status}{stage.qualification_count ? ` · Top ${stage.qualification_count} qualify` : ''}</p></div></div>{rows.length ? <><div className="mt-4 grid gap-3 sm:hidden">{rows.map((row) => <article key={row.team_id} className="rounded-xl border border-border bg-surface p-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 font-black text-primary">{row.rank}</span><div><h3 className="font-bold">{row.team_name}</h3><p className="text-xs text-text-muted">{row.played} played · {row.won} won · {row.league_points} pts</p></div></div><div className="mt-3 grid grid-cols-3 gap-2 text-xs text-text-secondary"><span>W-L {row.won}-{row.lost}</span><span>Sets {row.sets_won}-{row.sets_lost}</span><span>Points {row.points_for}-{row.points_against}</span></div></article>)}</div><div className="mt-4 hidden overflow-x-auto rounded-xl border border-border sm:block"><table className="w-full min-w-180 text-left text-sm"><thead className="bg-surface-muted text-xs uppercase text-text-muted"><tr><th className="p-3">Pos</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Sets W-L</th><th>Set Diff</th><th>Points F-A</th><th>Point Diff</th><th>League Pts</th></tr></thead><tbody>{rows.map((row) => <tr key={row.team_id} className="border-t border-border"><td className="p-3 font-black text-primary">{row.rank}</td><td className="font-bold">{row.team_name}</td><td>{row.played}</td><td>{row.won}</td><td>{row.lost}</td><td>{row.sets_won}-{row.sets_lost}</td><td>{row.sets_won-row.sets_lost}</td><td>{row.points_for}-{row.points_against}</td><td>{row.points_for-row.points_against}</td><td className="font-black">{row.league_points}</td></tr>)}</tbody></table></div></> : <p className="mt-4 rounded-xl border border-dashed border-border p-6 text-sm text-text-secondary">Standings will appear after league matches begin.</p>}</section>)}{tables.length === 0 ? <p className="rounded-xl border border-dashed border-border p-8 text-text-secondary">No league stage has been configured yet. Set up competition structure under Fixtures.</p> : null}</div></main>;
}
