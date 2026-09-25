'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Undo2, Trophy, Clock, Wifi, WifiOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type MatchState = {
  match: {
    id: string;
    status: string;
    match_number: number | null;
    scheduled_at: string | null;
    venue: string | null;
    court: string | null;
  };
  home_team: { id: string; name: string; short_name: string | null };
  away_team: { id: string; name: string; short_name: string | null };
  sets: Array<{
    id: string;
    set_number: number;
    target_points: number;
    home_score: number;
    away_score: number;
    status: string;
    winner_team_id: string | null;
  }>;
};

export function ScorerMatchClient({ initialState }: { initialState: MatchState }) {
  const [state, setState] = useState<MatchState>(initialState);
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conn, setConn] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');

  const supabase = useMemo(() => createClient(), []);
  const isWorking = useRef(false);
  const nextIkey = useRef(crypto.randomUUID());

  // Derive active set (first PENDING/LIVE or the last completed one)
  const activeSet =
    state.sets.find((s) => s.status === 'PENDING' || s.status === 'LIVE') ??
    state.sets[state.sets.length - 1];

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_scorer_match_state', {
      p_match_id: state.match.id,
    });
    if (!error && data) {
      setState(data as MatchState);
      setConn('live');
    }
  }, [state.match.id, supabase]);

  useEffect(() => {
    // Listen to score_events for real-time updates from other scorers or actions
    const channel = supabase
      .channel(`scorer-match-${state.match.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_events', filter: `match_id=eq.${state.match.id}` },
        () => void refresh()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${state.match.id}` },
        () => void refresh()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConn('live');
          void refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('reconnecting');
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onOnline = () => void refresh();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      void supabase.removeChannel(channel);
    };
  }, [refresh, state.match.id, supabase]);

  async function awardPoint(teamId: string) {
    if (isWorking.current || state.match.status === 'COMPLETED') return;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);

    const key = nextIkey.current;

    // Optimistic update
    const isHome = teamId === state.home_team.id;
    const optState = { ...state };
    const optSets = [...state.sets];
    const activeSetIdx = optSets.findIndex(s => s.id === activeSet?.id);
    if (activeSetIdx >= 0) {
      optSets[activeSetIdx] = {
        ...optSets[activeSetIdx],
        home_score: optSets[activeSetIdx].home_score + (isHome ? 1 : 0),
        away_score: optSets[activeSetIdx].away_score + (isHome ? 0 : 1),
      };
      optState.sets = optSets;
      setState(optState);
    }

    try {
      const { error } = await supabase.rpc('award_point', {
        p_match_id: state.match.id,
        p_team_id: teamId,
        p_idempotency_key: key,
      });

      if (error) {
        setErrorMsg(error.message);
        await refresh(); // revert optimistic on error
      } else {
        nextIkey.current = crypto.randomUUID(); // rotate idempotency
        await refresh(); // get official state with completion calculations
      }
    } finally {
      isWorking.current = false;
      setPending(false);
    }
  }

  async function undo() {
    if (isWorking.current || state.match.status === 'COMPLETED') return;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('undo_last_score_event', {
        p_match_id: state.match.id,
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        nextIkey.current = crypto.randomUUID(); // rotate key to prevent resubmitting undone action if cached
        await refresh();
      }
    } finally {
      isWorking.current = false;
      setPending(false);
    }
  }

  // --- Calculations for display ---
  const homeSetsWon = state.sets.filter((s) => s.winner_team_id === state.home_team.id).length;
  const awaySetsWon = state.sets.filter((s) => s.winner_team_id === state.away_team.id).length;

  const isCompleted = state.match.status === 'COMPLETED';
  const showUndo = !isCompleted && state.sets.some(s => s.home_score > 0 || s.away_score > 0);

  return (
    <div className="space-y-6 lg:space-y-8 select-none">
      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 lg:p-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">
              Match {state.match.match_number ?? '—'}
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider
                ${conn === 'live'
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
                  : 'border-amber-400/30 bg-amber-400/10 text-amber-400'
                }`}
            >
              {conn === 'live' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {conn === 'live' ? 'Live' : 'Reconnecting'}
            </span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white">
            {state.home_team.short_name ?? state.home_team.name} <span className="text-white/30 text-2xl mx-1">vs</span> {state.away_team.short_name ?? state.away_team.name}
          </h1>
          <p className="mt-2 text-sm text-white/50 flex items-center gap-2 font-medium">
            <Clock className="w-4 h-4" />
            {state.match.venue ?? 'Venue pending'}{state.match.court ? ` · Court ${state.match.court}` : ''}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">Status</p>
          <span className={`inline-block rounded-xl border px-4 py-2 text-sm font-black tracking-widest uppercase
            ${isCompleted ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-red-500/30 bg-red-500/10 text-red-400 animate-pulse'}`}>
            {state.match.status}
          </span>
        </div>
      </header>

      {/* ERROR MESSAGE */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center text-sm font-semibold text-red-200"
          >
            {errorMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* MATCH SCORE / LIVE CONTROLS */}
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#1c1533] to-[#120e21] p-4 sm:p-8">

        {/* Set Score Banner */}
        <div className="mb-8 flex items-center justify-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">{state.home_team.short_name ?? state.home_team.name}</p>
            <p className="text-4xl font-black text-white">{homeSetsWon}</p>
          </div>
          <div className="flex flex-col items-center px-4">
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-300/60 mb-2">Sets</span>
            <div className="h-8 w-px bg-white/10" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-1">{state.away_team.short_name ?? state.away_team.name}</p>
            <p className="text-4xl font-black text-white">{awaySetsWon}</p>
          </div>
        </div>

        {/* Current Set Info */}
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-200">
            Set {activeSet?.set_number ?? 1}
            <span className="text-fuchsia-300/40">·</span>
            Target {activeSet?.target_points ?? 25}
          </span>
        </div>

        {/* Big Scoring Buttons */}
        <div className="grid grid-cols-2 gap-4 lg:gap-8 relative">
          <ScoreButton
            teamName={state.home_team.short_name ?? state.home_team.name}
            score={activeSet?.home_score ?? 0}
            active={state.home_team.id === activeSet?.winner_team_id}
            color="fuchsia"
            onClick={() => void awardPoint(state.home_team.id)}
            disabled={pending || isCompleted}
          />
          <ScoreButton
            teamName={state.away_team.short_name ?? state.away_team.name}
            score={activeSet?.away_score ?? 0}
            active={state.away_team.id === activeSet?.winner_team_id}
            color="cyan"
            onClick={() => void awardPoint(state.away_team.id)}
            disabled={pending || isCompleted}
          />

          {/* Floating Undo Button */}
          {showUndo && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                disabled={pending}
                onClick={() => void undo()}
                className="group flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#120e21] bg-white/10 text-white/60 backdrop-blur-xl transition hover:bg-white/20 active:scale-95 disabled:opacity-50"
                aria-label="Undo last point"
              >
                <Undo2 className="h-6 w-6 transition-transform group-hover:-rotate-45" />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* SET HISTORY */}
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 lg:p-8">
        <h2 className="mb-6 text-sm font-bold uppercase tracking-[0.2em] text-white/50 flex items-center gap-2">
          <Trophy className="h-4 w-4" /> Match History
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {state.sets.map((set) => (
            <div
              key={set.id}
              className={`flex flex-col items-center justify-center rounded-2xl border p-4 transition-colors
                ${set.status === 'COMPLETED' ? 'border-white/10 bg-black/30' : 'border-fuchsia-500/20 bg-fuchsia-500/5'}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-3">Set {set.set_number}</p>
              <div className="flex items-center gap-4 text-2xl font-black">
                <span className={set.winner_team_id === state.home_team.id ? 'text-fuchsia-300' : 'text-white'}>
                  {set.home_score}
                </span>
                <span className="text-white/20 text-sm">—</span>
                <span className={set.winner_team_id === state.away_team.id ? 'text-cyan-300' : 'text-white'}>
                  {set.away_score}
                </span>
              </div>
              <p className={`mt-3 text-[9px] font-black uppercase tracking-[0.25em] 
                ${set.status === 'COMPLETED' ? 'text-emerald-500/70' : 'text-fuchsia-300/70'}`}>
                {set.status}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* DEBUG/MANUAL REFRESH */}
      <div className="flex justify-end px-4">
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-2 text-xs font-semibold text-white/30 hover:text-white/70 transition-colors"
        >
          <RefreshCcw className="h-3 w-3" />
          Sync State
        </button>
      </div>
    </div>
  );
}

function ScoreButton({
  teamName,
  score,
  active,
  color,
  onClick,
  disabled
}: {
  teamName: string;
  score: number;
  active: boolean;
  color: 'fuchsia' | 'cyan';
  onClick: () => void;
  disabled: boolean;
}) {
  const bgColors = color === 'fuchsia'
    ? 'bg-fuchsia-500 hover:bg-fuchsia-400 text-white'
    : 'bg-cyan-500 hover:bg-cyan-400 text-white';

  const borderColors = color === 'fuchsia'
    ? 'border-fuchsia-400/50'
    : 'border-cyan-400/50';

  const activeGlow = active
    ? color === 'fuchsia' ? 'shadow-[0_0_30px_rgba(217,70,239,0.2)]' : 'shadow-[0_0_30px_rgba(6,182,212,0.2)]'
    : '';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-white/5 py-12 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:py-16 ${activeGlow}`}
    >
      <div className={`absolute inset-0 opacity-0 transition-opacity group-hover:opacity-10 group-active:opacity-20 ${color === 'fuchsia' ? 'bg-fuchsia-500' : 'bg-cyan-500'}`} />

      <p className="relative z-10 mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/50 lg:text-sm">
        {teamName}
      </p>

      <motion.p
        key={score}
        initial={{ scale: 1.1, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative z-10 text-[5rem] font-black leading-none tracking-tighter text-white sm:text-[7rem] lg:text-[9rem]"
      >
        {score}
      </motion.p>

      <div className="relative z-10 mt-6 md:mt-8">
        <span className={`inline-flex items-center rounded-full border px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors ${bgColors} ${borderColors}`}>
          Award Point
        </span>
      </div>
    </button>
  );
}