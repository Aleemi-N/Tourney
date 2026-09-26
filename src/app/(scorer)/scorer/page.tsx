import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ScorerShell } from '@/components/scorer/ScorerShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarClock } from 'lucide-react';

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

  return <ScorerShell><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Scorer workspace</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Assigned matches</h1><p className="mt-3 text-base leading-7 text-white/55">Only matches assigned to your account appear here. Point actions remain authorized by the scoring RPC.</p><div className="mt-8 space-y-3">{matches.filter(Boolean).map((match) => match ? <Link key={match.match.id} href={`/scorer/matches/${match.match.id}`} className="block rounded-2xl border border-white/10 bg-[#17132a] p-4 transition hover:border-fuchsia-200/30 hover:bg-white/5 sm:rounded-3xl sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-200/60">Match {match.match.match_number ?? '—'}</p><h2 className="mt-2 break-words text-lg font-black sm:text-xl">{match.home_team.name} <span className="text-white/35">vs</span> {match.away_team.name}</h2><p className="mt-1 text-sm text-white/45">{match.match.venue ?? 'Venue pending'}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/55">{match.match.status}</span></div></Link> : null)}{matches.filter(Boolean).length === 0 ? <EmptyState title="No assigned matches" description="When an organizer assigns you to a match, it will appear here automatically." icon={<CalendarClock className="h-5 w-5" />} /> : null}</div></div></ScorerShell>;
}
