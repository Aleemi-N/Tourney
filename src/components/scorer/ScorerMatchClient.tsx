'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Undo2, Trophy, Clock, Wifi, WifiOff, Hourglass } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type ActiveTimeout = {
  id: string;
  team_id: string;
  timeout_number: number;
  duration_seconds: number;
  started_at: string;
  remaining_seconds: number;
};

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
  timeouts?: {
    max_per_set: number;
    duration_seconds: number;
    home_used: number;
    away_used: number;
    active: ActiveTimeout | null;
  };
};

function getFriendlyErrorMessage(err: { message?: string } | null): string {
  if (!err?.message) return 'Action could not be completed. State has been refreshed.';
  const msg = err.message;
  if (msg.includes('Cannot award point while a timeout is actively running')) {
    return 'Scoring paused: timeout is currently in progress.';
  }
  if (msg.includes('Team has already used all allowed timeouts')) {
    return 'Timeout limit reached for this set.';
  }
  if (msg.includes('No score event found to undo')) {
    return 'No remaining points to undo in this set.';
  }
  if (msg.includes('unique constraint') || msg.includes('score_events') || msg.includes('idempotency')) {
    return 'Score could not be updated. The latest match state has been restored.';
  }
  return 'Score could not be updated. The latest match state has been restored.';
}

export function ScorerMatchClient({ initialState }: { initialState: MatchState }) {
  const [state, setState] = useState<MatchState>(initialState);
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conn, setConn] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [now, setNow] = useState(() => Date.now());

  const supabase = useMemo(() => createClient(), []);
  const isWorking = useRef(false);
  const isSubmittingRef = useRef(false);
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

  // Realtime subscriptions
  useEffect(() => {
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_timeouts', filter: `match_id=eq.${state.match.id}` },
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

  // Authoritative countdown timer for active timeout
  const rawActiveTimeout = state.timeouts?.active;
  useEffect(() => {
    if (!rawActiveTimeout?.started_at) return;

    const started = new Date(rawActiveTimeout.started_at).getTime();
    const durationMs = rawActiveTimeout.duration_seconds * 1000;
    const expiresAt = started + durationMs;

    const timer = setInterval(() => {
      const remainingMs = expiresAt - Date.now();
      setNow(Date.now());
      if (remainingMs <= 0) {
        clearInterval(timer);
        void refresh();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [rawActiveTimeout?.started_at, rawActiveTimeout?.duration_seconds, refresh]);

  const countdown = useMemo(() => {
    if (!rawActiveTimeout?.started_at) return 0;
    const started = new Date(rawActiveTimeout.started_at).getTime();
    const durationMs = rawActiveTimeout.duration_seconds * 1000;
    return Math.max(0, Math.ceil((started + durationMs - now) / 1000));
  }, [rawActiveTimeout, now]);

  async function awardPoint(teamId: string) {
    if (isWorking.current || isSubmittingRef.current || state.match.status === 'COMPLETED') return;
    if (state.timeouts?.active && countdown > 0) {
      setErrorMsg('Scoring paused: timeout is currently in progress.');
      return;
    }

    // Synchronous immediate guards
    isSubmittingRef.current = true;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);

    const key = nextIkey.current;

    // Optimistic update
    const isHome = teamId === state.home_team.id;
    const optState = { ...state };
    const optSets = [...state.sets];
    const activeSetIdx = optSets.findIndex((s) => s.id === activeSet?.id);
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
        setErrorMsg(getFriendlyErrorMessage(error));
        await refresh(); // revert optimistic on error
      } else {
        nextIkey.current = crypto.randomUUID(); // rotate idempotency
        await refresh(); // sync official state
      }
    } finally {
      isSubmittingRef.current = false;
      isWorking.current = false;
      setPending(false);
    }
  }

  async function undo() {
    if (isWorking.current || isSubmittingRef.current || state.match.status === 'COMPLETED') return;
    isSubmittingRef.current = true;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('undo_last_score_event', {
        p_match_id: state.match.id,
      });
      if (error) {
        setErrorMsg(getFriendlyErrorMessage(error));
      } else {
        nextIkey.current = crypto.randomUUID();
        await refresh();
      }
    } finally {
      isSubmittingRef.current = false;
      isWorking.current = false;
      setPending(false);
    }
  }

  async function handleCallTimeout(teamId: string) {
    if (isWorking.current || isSubmittingRef.current || state.match.status === 'COMPLETED') return;
    isSubmittingRef.current = true;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('call_match_timeout', {
        p_match_id: state.match.id,
        p_team_id: teamId,
      });
      if (error) {
        setErrorMsg(getFriendlyErrorMessage(error));
      }
      await refresh();
    } finally {
      isSubmittingRef.current = false;
      isWorking.current = false;
      setPending(false);
    }
  }

  async function handleEndTimeout() {
    if (isWorking.current || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    isWorking.current = true;
    setPending(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.rpc('end_match_timeout', {
        p_match_id: state.match.id,
      });
      if (error) {
        setErrorMsg(getFriendlyErrorMessage(error));
      }
      await refresh();
    } finally {
      isSubmittingRef.current = false;
      isWorking.current = false;
      setPending(false);
    }
  }

  // --- Calculations for display ---
  const homeSetsWon = state.sets.filter((s) => s.winner_team_id === state.home_team.id).length;
  const awaySetsWon = state.sets.filter((s) => s.winner_team_id === state.away_team.id).length;

  const isCompleted = state.match.status === 'COMPLETED';
  const showUndo = !isCompleted && state.sets.some((s) => s.home_score > 0 || s.away_score > 0);

  const activeTimeout = state.timeouts?.active && countdown > 0 ? state.timeouts.active : null;
  const timeoutTeamName = activeTimeout?.team_id === state.home_team.id
    ? (state.home_team.short_name ?? state.home_team.name)
    : (state.away_team.short_name ?? state.away_team.name);

  const maxTimeouts = state.timeouts?.max_per_set ?? 2;
  const homeTimeoutsUsed = state.timeouts?.home_used ?? 0;
  const awayTimeoutsUsed = state.timeouts?.away_used ?? 0;

  return (
    <div className="space-y-6 select-none lg:space-y-8">
      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 lg:p-8">
        <div>
          <div className="mb-2 flex items-center gap-3">
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
          <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
            {state.home_team.short_name ?? state.home_team.name} <span className="mx-1 text-2xl text-white/30">vs</span> {state.away_team.short_name ?? state.away_team.name}
          </h1>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-white/50">
            <Clock className="h-4 w-4" />
            {state.match.venue ?? 'Venue pending'}{state.match.court ? ` · Court ${state.match.court}` : ''}
          </p>
        </div>
        <div className="text-center">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Status</p>
          <span className={`inline-block rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-widest
            ${isCompleted ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'animate-pulse border-red-500/30 bg-red-500/10 text-red-400'}`}>
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

      {/* ACTIVE TIMEOUT OVERLAY BANNER */}
      <AnimatePresence>
        {activeTimeout && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-3xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-600/20 to-amber-500/20 p-6 text-center shadow-[0_0_40px_rgba(245,158,11,0.2)]"
          >
            <div className="flex flex-col items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-amber-300">
                <Hourglass className="h-4 w-4 animate-spin" /> Timeout Active
              </span>
              <p className="mt-1 text-xl font-black uppercase tracking-tight text-white">
                {timeoutTeamName}
              </p>
              <p className="font-mono text-5xl font-black text-amber-300">
                00:{String(countdown).padStart(2, '0')}
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => void handleEndTimeout()}
                className="mt-3 inline-flex items-center rounded-xl border border-amber-400/40 bg-amber-400/20 px-5 py-2 text-xs font-bold uppercase tracking-wider text-amber-200 transition hover:bg-amber-400/30 disabled:opacity-50"
              >
                End Timeout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MATCH SCORE / LIVE CONTROLS */}
      <section className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#1c1533] to-[#120e21] p-4 sm:p-8">
        {/* Set Score Banner */}
        <div className="mb-8 flex items-center justify-center gap-6">
          <div className="text-right">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{state.home_team.short_name ?? state.home_team.name}</p>
            <p className="text-4xl font-black text-white">{homeSetsWon}</p>
          </div>
          <div className="flex flex-col items-center px-4">
            <span className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-fuchsia-300/60">Sets</span>
            <div className="h-8 w-px bg-white/10" />
          </div>
          <div className="text-left">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">{state.away_team.short_name ?? state.away_team.name}</p>
            <p className="text-4xl font-black text-white">{awaySetsWon}</p>
          </div>
        </div>

        {/* Current Set Info */}
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-fuchsia-200">
            Set {activeSet?.set_number ?? 1}
            <span className="text-fuchsia-300/40">·</span>
            Target {activeSet?.target_points ?? 25}
          </span>
        </div>

        {/* Big Scoring Buttons */}
        <div className="relative grid grid-cols-2 gap-4 lg:gap-8">
          <ScoreButton
            teamName={state.home_team.short_name ?? state.home_team.name}
            score={activeSet?.home_score ?? 0}
            active={state.home_team.id === activeSet?.winner_team_id}
            color="fuchsia"
            onClick={() => void awardPoint(state.home_team.id)}
            disabled={pending || isCompleted || Boolean(activeTimeout)}
          />
          <ScoreButton
            teamName={state.away_team.short_name ?? state.away_team.name}
            score={activeSet?.away_score ?? 0}
            active={state.away_team.id === activeSet?.winner_team_id}
            color="cyan"
            onClick={() => void awardPoint(state.away_team.id)}
            disabled={pending || isCompleted || Boolean(activeTimeout)}
          />

          {/* Floating Undo Button */}
          {showUndo && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <button
                type="button"
                disabled={pending || Boolean(activeTimeout)}
                onClick={() => void undo()}
                className="group flex h-14 w-14 items-center justify-center rounded-full border-4 border-[#120e21] bg-white/10 text-white/60 backdrop-blur-xl transition hover:bg-white/20 active:scale-95 disabled:opacity-50"
                aria-label="Undo last point"
              >
                <Undo2 className="h-6 w-6 transition-transform group-hover:-rotate-45" />
              </button>
            </div>
          )}
        </div>

        {/* Team Timeout Controls */}
        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/10 pt-6 lg:gap-8">
          {/* Home Team Timeout */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
              Timeouts: {homeTimeoutsUsed} / {maxTimeouts}
            </span>
            <button
              type="button"
              disabled={pending || isCompleted || Boolean(activeTimeout) || homeTimeoutsUsed >= maxTimeouts}
              onClick={() => void handleCallTimeout(state.home_team.id)}
              className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-4 py-2 text-xs font-bold tracking-wider text-fuchsia-200 uppercase transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Timeout
            </button>
          </div>

          {/* Away Team Timeout */}
          <div className="flex flex-col items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
              Timeouts: {awayTimeoutsUsed} / {maxTimeouts}
            </span>
            <button
              type="button"
              disabled={pending || isCompleted || Boolean(activeTimeout) || awayTimeoutsUsed >= maxTimeouts}
              onClick={() => void handleCallTimeout(state.away_team.id)}
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-bold tracking-wider text-cyan-200 uppercase transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Timeout
            </button>
          </div>
        </div>
      </section>

      {/* SET HISTORY */}
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 lg:p-8">
        <h2 className="mb-6 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-white/50">
          <Trophy className="h-4 w-4" /> Match History
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {state.sets.map((set) => (
            <div
              key={set.id}
              className={`flex flex-col items-center justify-center rounded-2xl border p-4 transition-colors
                ${set.status === 'COMPLETED' ? 'border-white/10 bg-black/30' : 'border-fuchsia-500/20 bg-fuchsia-500/5'}`}
            >
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Set {set.set_number}</p>
              <div className="flex items-center gap-4 text-2xl font-black">
                <span className={set.winner_team_id === state.home_team.id ? 'text-fuchsia-300' : 'text-white'}>
                  {set.home_score}
                </span>
                <span className="text-sm text-white/20">—</span>
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
          className="flex items-center gap-2 text-xs font-semibold text-white/30 transition-colors hover:text-white/70"
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
  disabled,
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