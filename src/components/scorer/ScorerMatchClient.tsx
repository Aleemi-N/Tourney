'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type MatchState = {
  match: { id: string; status: string; match_number: number | null; scheduled_at: string | null; venue: string | null; court: string | null };
  home_team: { id: string; name: string; short_name: string | null };
  away_team: { id: string; name: string; short_name: string | null };
  sets: Array<{ id: string; set_number: number; target_points: number; home_score: number; away_score: number; status: string; winner_team_id: string | null }>;
};

export function ScorerMatchClient({ initialState }: { initialState: MatchState }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const activeSet = state.sets.find((set) => set.status === 'PENDING' || set.status === 'LIVE') ?? state.sets[state.sets.length - 1];

  useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const { data } = await supabase.rpc('get_scorer_match_state', { p_match_id: state.match.id });
      if (data) setState(data as MatchState);
    };
    const channel = supabase.channel(`scorer-match-${state.match.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'match_sets', filter: `match_id=eq.${state.match.id}` }, () => void refresh()).subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); void supabase.removeChannel(channel); };
  }, [state.match.id]);

  async function awardPoint(teamId: string) {
    if (pending || state.match.status === 'COMPLETED') return;
    setPending(true);
    setMessage('Saving point…');
    const supabase = createClient();
    const { error } = await supabase.rpc('award_point', { p_match_id: state.match.id, p_team_id: teamId, p_idempotency_key: crypto.randomUUID() });
    if (error) setMessage(error.message);
    else setMessage('Point recorded.');
    const refreshed = await supabase.rpc('get_scorer_match_state', { p_match_id: state.match.id });
    if (!refreshed.error && refreshed.data) setState(refreshed.data as MatchState);
    setPending(false);
  }

  async function undo() {
    if (pending) return;
    setPending(true);
    setMessage('Undoing last point…');
    const supabase = createClient();
    const { error } = await supabase.rpc('undo_last_score_event', { p_match_id: state.match.id });
    setMessage(error ? error.message : 'Last point undone.');
    const refreshed = await supabase.rpc('get_scorer_match_state', { p_match_id: state.match.id });
    if (!refreshed.error && refreshed.data) setState(refreshed.data as MatchState);
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Match {state.match.match_number ?? '—'}</p><h1 className="mt-2 text-3xl font-black tracking-tight">{state.home_team.name} <span className="text-white/35">vs</span> {state.away_team.name}</h1><p className="mt-2 text-sm text-white/45">{state.match.venue ?? 'Venue pending'}{state.match.court ? ` · ${state.match.court}` : ''}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/60">{state.match.status}</span></div>
      <section className="rounded-3xl border border-white/10 bg-[#17132a] p-5 sm:p-8"><div className="grid gap-4 sm:grid-cols-2"><ScoreCard name={state.home_team.name} score={activeSet?.home_score ?? 0} active={state.home_team.id === activeSet?.winner_team_id} /><ScoreCard name={state.away_team.name} score={activeSet?.away_score ?? 0} active={state.away_team.id === activeSet?.winner_team_id} /></div><div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><p className="text-sm font-semibold text-white/60">Set {activeSet?.set_number ?? '—'} · first to {activeSet?.target_points ?? '—'} with configured rules</p><button type="button" disabled={pending || state.match.status === 'COMPLETED'} onClick={() => void undo()} className="min-h-12 rounded-2xl border border-white/15 px-5 text-sm font-bold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">Undo last point</button></div></section>
      <div className="grid gap-3 sm:grid-cols-2"><button type="button" disabled={pending || state.match.status === 'COMPLETED'} onClick={() => void awardPoint(state.home_team.id)} className="min-h-16 rounded-2xl bg-fuchsia-300 px-5 text-base font-black text-[#211334] transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40">Point for {state.home_team.short_name ?? state.home_team.name}</button><button type="button" disabled={pending || state.match.status === 'COMPLETED'} onClick={() => void awardPoint(state.away_team.id)} className="min-h-16 rounded-2xl bg-cyan-200 px-5 text-base font-black text-[#10202b] transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">Point for {state.away_team.short_name ?? state.away_team.name}</button></div>
      {message ? <p role="status" className="text-sm text-white/65">{message}</p> : null}
      <section className="rounded-3xl border border-white/10 bg-white/3 p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">Set history</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{state.sets.map((set) => <div key={set.id} className="rounded-2xl border border-white/10 px-4 py-3"><p className="text-xs text-white/40">Set {set.set_number}</p><p className="mt-1 text-xl font-black">{set.home_score} — {set.away_score}</p><p className="mt-1 text-xs uppercase tracking-wider text-white/40">{set.status}</p></div>)}</div></section>
      <button type="button" onClick={() => router.refresh()} className="text-sm font-semibold text-fuchsia-200 hover:text-fuchsia-100">Refresh authoritative snapshot</button>
    </div>
  );
}

function ScoreCard({ name, score, active }: { name: string; score: number; active: boolean }) {
  return <div className={`rounded-2xl border p-5 ${active ? 'border-emerald-200/40 bg-emerald-200/10' : 'border-white/10 bg-black/15'}`}><p className="truncate text-sm font-bold text-white/60">{name}</p><p className="mt-2 text-6xl font-black tracking-tight">{score}</p></div>;
}