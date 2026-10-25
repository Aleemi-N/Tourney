'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCcw, Undo2, Trophy, Clock, Wifi, WifiOff, Hourglass, MapPin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { cn, teamColorStyle } from '@/lib/utils';

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

export function ScorerMatchClient({
  initialState,
  homeColor,
  awayColor,
}: {
  initialState: MatchState;
  /** Team colours (teams.primary_color); defaults apply when a team has none. */
  homeColor?: string | null;
  awayColor?: string | null;
}) {
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
  const scoringLocked = pending || isCompleted || Boolean(activeTimeout);
  const home = { ...state.home_team, color: homeColor ?? DEFAULT_HOME_COLOR };
  const away = { ...state.away_team, color: awayColor ?? DEFAULT_AWAY_COLOR };

  return (
    <div className="mx-auto max-w-3xl select-none space-y-4" aria-busy={pending}>
      <header className={`${cardClasses} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Match {state.match.match_number ?? '—'}
            {state.match.court ? ` · Court ${state.match.court}` : ''}
          </p>
          <h1 className="mt-0.5 text-lg font-bold leading-snug text-text-primary sm:text-xl">
            {home.name} <span className="font-medium text-text-muted">vs</span> {away.name}
          </h1>
          {state.match.venue ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-text-secondary">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              {state.match.venue}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={conn === 'live' ? 'success' : 'warning'}>
            {conn === 'live' ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
            {conn === 'live' ? 'Connected' : 'Reconnecting'}
          </StatusPill>
          <StatusPill status={state.match.status} />
        </div>
      </header>

      <AnimatePresence>
        {errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center text-sm font-semibold text-danger"
            role="alert"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeTimeout && (
          <motion.section
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warning/30 bg-warning/10 p-4"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 text-warning">
              <Hourglass className="h-6 w-6 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Timeout · {timeoutTeamName}</p>
                <p className="font-mono text-3xl font-bold tabular-nums">00:{String(countdown).padStart(2, '0')}</p>
              </div>
            </div>
            <Button variant="secondary" disabled={pending} onClick={() => void handleEndTimeout()}>
              End timeout
            </Button>
          </motion.section>
        )}
      </AnimatePresence>

      <section className={`${cardClasses} p-3 sm:p-4`} aria-label="Score">
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <SetsWon team={home} won={homeSetsWon} />
          <p className="text-center text-sm font-semibold text-text-secondary">
            Set {activeSet?.set_number ?? 1}
            <span className="block text-xs font-medium text-text-muted">to {activeSet?.target_points ?? 25}</span>
          </p>
          <SetsWon team={away} won={awaySetsWon} reverse />
        </div>

        <div className="relative grid grid-cols-2 gap-2 sm:gap-3">
          <ScoreButton team={home} score={activeSet?.home_score ?? 0} disabled={scoringLocked} onClick={() => void awardPoint(home.id)} />
          <ScoreButton team={away} score={activeSet?.away_score ?? 0} disabled={scoringLocked} onClick={() => void awardPoint(away.id)} />
          {showUndo && (
            <button
              type="button"
              disabled={pending || Boolean(activeTimeout)}
              onClick={() => void undo()}
              aria-label="Undo last point"
              className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-surface bg-surface-raised text-text-primary shadow-overlay transition-colors hover:bg-surface-muted disabled:opacity-50"
            >
              <Undo2 className="h-6 w-6" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <TimeoutButton
          used={homeTimeoutsUsed}
          max={maxTimeouts}
          disabled={scoringLocked || homeTimeoutsUsed >= maxTimeouts}
          onClick={() => void handleCallTimeout(home.id)}
          label={`Call timeout for ${home.name}`}
        />
        <TimeoutButton
          used={awayTimeoutsUsed}
          max={maxTimeouts}
          disabled={scoringLocked || awayTimeoutsUsed >= maxTimeouts}
          onClick={() => void handleCallTimeout(away.id)}
          label={`Call timeout for ${away.name}`}
        />
      </div>

      <section className={`${cardClasses} px-4 py-1`} aria-labelledby="set-history">
        <h2 id="set-history" className="flex items-center gap-2 pb-1 pt-3 text-sm font-semibold text-text-secondary">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          Sets
        </h2>
        <ul role="list" className="divide-y divide-border">
          {state.sets.map((set) => {
            const winner = set.winner_team_id === home.id ? home : set.winner_team_id === away.id ? away : null;
            return (
              <li key={set.id} className="flex min-h-12 items-center justify-between gap-3">
                <span className="w-14 text-sm font-medium text-text-secondary">Set {set.set_number}</span>
                <span className={cn('text-base font-bold tabular-nums', set.status === 'PENDING' ? 'text-text-muted' : 'text-text-primary')}>
                  {set.home_score} – {set.away_score}
                </span>
                <span className="flex w-16 justify-end">
                  {winner ? (
                    <TeamChip team={winner} />
                  ) : set.status === 'LIVE' ? (
                    <StatusPill status="LIVE" />
                  ) : (
                    <span className="text-xs text-text-muted">{set.status === 'PENDING' ? 'Not started' : ''}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Sync state
        </Button>
      </div>
    </div>
  );
}

// Fallbacks when a team has no colour of its own.
const DEFAULT_HOME_COLOR = '#4f46e5';
const DEFAULT_AWAY_COLOR = '#0f766e';

type ScorerTeam = { id: string; name: string; short_name: string | null; color: string };

function TeamChip({ team }: { team: ScorerTeam }) {
  return (
    <span className="rounded-md px-2 py-0.5 text-xs font-bold" style={teamColorStyle(team.color)}>
      {(team.short_name ?? team.name).slice(0, 4).toUpperCase()}
    </span>
  );
}

function SetsWon({ team, won, reverse = false }: { team: ScorerTeam; won: number; reverse?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2', reverse && 'flex-row-reverse')}>
      <TeamChip team={team} />
      <span className="text-2xl font-bold tabular-nums text-text-primary" aria-label={`${team.name} sets won: ${won}`}>{won}</span>
    </div>
  );
}

function ScoreButton({ team, score, disabled, onClick }: { team: ScorerTeam; score: number; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Award point to ${team.name}. Current score ${score}`}
      className="flex min-h-64 min-w-0 flex-col items-center justify-between gap-3 rounded-2xl border border-border border-t-[6px] px-2 pb-4 pt-5 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-80"
      style={{ borderTopColor: team.color, backgroundColor: `color-mix(in srgb, ${team.color} 8%, var(--surface))` }}
    >
      <span className="line-clamp-2 max-w-full text-center text-sm font-semibold text-text-primary sm:text-base">{team.name}</span>
      <motion.span
        key={score}
        initial={{ scale: 1.08, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-7xl font-bold leading-none tracking-tight text-text-primary tabular-nums sm:text-9xl"
      >
        {score}
      </motion.span>
      <span className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold" style={teamColorStyle(team.color)}>
        +1 point
      </span>
    </button>
  );
}

function TimeoutButton({ used, max, disabled, onClick, label }: { used: number; max: number; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex min-h-14 flex-col items-center justify-center rounded-xl border border-border-strong bg-surface text-text-primary transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Clock className="h-4 w-4" aria-hidden="true" />
        Timeout
      </span>
      <span className="text-xs text-text-muted">
        {used} of {max} used
      </span>
    </button>
  );
}
