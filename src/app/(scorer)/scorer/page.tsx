import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ScorerShell } from '@/components/scorer/ScorerShell';

export const metadata: Metadata = { title: 'Assigned Matches' };

export default async function ScorerHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: assignments } = await supabase.from('match_scorers').select('match_id').eq('user_id', user.id);
  const matches = await Promise.all((assignments ?? []).map(async (assignment) => {
    const { data } = await supabase.rpc('get_scorer_match_state', { p_match_id: assignment.match_id });
    return data as { match: { id: string; status: string; match_number: number | null; venue: string | null }; home_team: { name: string }; away_team: { name: string } } | null;
  }));

  return <ScorerShell><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Scorer workspace</p><h1 className="mt-3 text-4xl font-black tracking-tight">Assigned matches</h1><p className="mt-3 text-base leading-7 text-white/55">Only matches assigned to your account appear here. Point actions remain authorized by the scoring RPC.</p><div className="mt-8 space-y-3">{matches.filter(Boolean).map((match) => match ? <Link key={match.match.id} href={`/scorer/matches/${match.match.id}`} className="block rounded-3xl border border-white/10 bg-[#17132a] p-5 transition hover:border-fuchsia-200/30 hover:bg-white/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-200/60">Match {match.match.match_number ?? '—'}</p><h2 className="mt-2 text-xl font-black">{match.home_team.name} <span className="text-white/35">vs</span> {match.away_team.name}</h2><p className="mt-1 text-sm text-white/45">{match.match.venue ?? 'Venue pending'}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/55">{match.match.status}</span></div></Link> : null)}{matches.filter(Boolean).length === 0 ? <div className="rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-sm text-white/55">No matches are assigned to your account.</div> : null}</div></div></ScorerShell>;
}