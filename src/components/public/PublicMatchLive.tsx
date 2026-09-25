'use client';

/**
 * PublicMatchLive — Client component for live match spectating.
 *
 * Subscribes to the score_events table via Supabase Realtime to receive
 * live score updates. On each event it re-fetches the authoritative state
 * from get_public_match_state (never trusts event payloads for score values).
 *
 * SECURITY: Only calls get_public_match_state (SECURITY DEFINER, anon-safe).
 * Never reads match_sets, matches, or score_events tables directly.
 *
 * PWA/Offline:
 * - Shows Reconnecting overlay when connection drops
 * - Refetches authoritative state on reconnect
 * - Disabled critical mutation during offline (scoring is not done here)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WifiOff, RefreshCcw, Trophy } from 'lucide-react';


// ── Types (mirrors get_public_match_state output) ─────────────────────────────
interface MatchTeam {
  id: string;
  name: string;
  short_name: string | null;
}

interface SetState {
  set_number: number;
  target_points: number;
  home_score: number;
  away_score: number;
  status: string;
  winner_team_id: string | null;
}

interface MatchState {
  match: {
    id: string;
    tournament_id: string;
    stage_id: string | null;
    status: string;
    match_number: number | null;
    scheduled_at: string | null;
    venue: string | null;
    court: string | null;
    winner_team_id: string | null;
  };
  home_team: MatchTeam;
  away_team: MatchTeam;
  sets: SetState[];
}

interface Props {
  matchId: string;
  initialState: MatchState;
  /** TV/projector mode — large-screen minimal presentation */
  tvMode?: boolean;
}


function setsWon(sets: SetState[], teamId: string) {
  return sets.filter((s) => s.winner_team_id === teamId && s.status === 'COMPLETED').length;
}

function activeSet(sets: SetState[]): SetState | null {
  return sets.find((s) => s.status === 'LIVE') ?? sets.find((s) => s.status === 'PENDING') ?? null;
}

type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export function PublicMatchLive({ matchId, initialState, tvMode = false }: Props) {
  const [state, setState] = useState<MatchState>(initialState);
  const [conn, setConn] = useState<ConnectionStatus>('connected');
  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_public_match_state', { p_match_id: matchId });
    if (!error && data) setState(data as unknown as MatchState);
  }, [matchId, supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`public-match-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'score_events', filter: `match_id=eq.${matchId}` },
        () => { void refresh(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => { void refresh(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConn('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConn('offline');
        else setConn('connecting');
      });

    channelRef.current = channel;

    // Visibility recovery + online recovery
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const handleOnline = () => void refresh();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleOnline);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleOnline);
    };
  }, [matchId, supabase, refresh]);

  const { match, home_team: home, away_team: away, sets } = state;
  const isCompleted = match.status === 'COMPLETED';
  const homeSets = setsWon(sets, home.id);
  const awaySets = setsWon(sets, away.id);
  const current = activeSet(sets);
  const winner = match.winner_team_id === home.id ? home : match.winner_team_id === away.id ? away : null;

  // ── TV / Projector Mode ────────────────────────────────────────────────────
  if (tvMode) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center"
        style={{ background: '#07060e', color: '#f0f0f4' }}
        role="region"
        aria-label="Live scoreboard"
      >
        {/* Connection dot */}
        <div className="absolute right-6 top-6 flex items-center gap-2 text-xs font-bold">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: conn === 'connected' ? '#4ade80'
                : conn === 'offline' ? '#f87171' : '#fbbf24',
              boxShadow: conn === 'connected' ? '0 0 6px #4ade80' : undefined,
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>
            {conn === 'connected' ? 'LIVE' : conn === 'offline' ? 'OFFLINE' : 'CONNECTING'}
          </span>
        </div>

        {/* Match label */}
        <p className="mb-8 text-sm font-bold uppercase tracking-[0.3em]" style={{ color: 'rgba(165,180,252,0.6)' }}>
          {match.venue ? `${match.venue}${match.court ? ` · ${match.court}` : ''}` : 'Match'} #{match.match_number ?? '—'}
        </p>

        {/* Main scoreboard */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8 w-full max-w-5xl px-8">
          {/* Home */}
          <div className="text-center">
            <p className="mb-4 text-2xl font-black uppercase tracking-widest" style={{ color: 'rgba(165,180,252,0.8)' }}>
              {home.short_name ?? home.name}
            </p>
            <p
              className="text-[clamp(6rem,20vw,14rem)] font-black leading-none tabular-nums"
              style={{ color: homeSets > awaySets ? '#f0f0f4' : 'rgba(255,255,255,0.25)' }}
            >
              {homeSets}
            </p>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center gap-4">
            <span className="text-4xl font-black" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
            {current && !isCompleted && (
              <div className="text-center">
                <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(165,180,252,0.5)' }}>
                  Set {current.set_number}
                </p>
                <p className="text-4xl font-black tabular-nums">
                  {current.home_score}:{current.away_score}
                </p>
              </div>
            )}
            {winner && isCompleted && (
              <div className="text-center">
                <Trophy className="h-8 w-8 mx-auto mb-2" style={{ color: '#fbbf24' }} />
                <p className="text-sm font-bold" style={{ color: '#fbbf24' }}>{winner.name} Wins</p>
              </div>
            )}
          </div>

          {/* Away */}
          <div className="text-center">
            <p className="mb-4 text-2xl font-black uppercase tracking-widest" style={{ color: 'rgba(196,181,253,0.8)' }}>
              {away.short_name ?? away.name}
            </p>
            <p
              className="text-[clamp(6rem,20vw,14rem)] font-black leading-none tabular-nums"
              style={{ color: awaySets > homeSets ? '#f0f0f4' : 'rgba(255,255,255,0.25)' }}
            >
              {awaySets}
            </p>
          </div>
        </div>

        {/* Set history */}
        {sets.filter((s) => s.status === 'COMPLETED').length > 0 && (
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            {sets.filter((s) => s.status === 'COMPLETED').map((s) => {
              const homeWon = s.winner_team_id === home.id;
              return (
                <div
                  key={s.set_number}
                  className="rounded-xl px-5 py-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p className="mb-1 text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Set {s.set_number}
                  </p>
                  <p className="text-2xl font-black tabular-nums">
                    <span style={{ color: homeWon ? '#f0f0f4' : 'rgba(255,255,255,0.3)' }}>{s.home_score}</span>
                    <span className="mx-2" style={{ color: 'rgba(255,255,255,0.15)' }}>–</span>
                    <span style={{ color: !homeWon ? '#f0f0f4' : 'rgba(255,255,255,0.3)' }}>{s.away_score}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/* Connection status */}
      {conn !== 'connected' && (
        <div
          className="mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
          style={{
            background: conn === 'offline' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
            border: `1px solid ${conn === 'offline' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
            color: conn === 'offline' ? '#f87171' : '#fbbf24',
          }}
        >
          {conn === 'offline' ? <WifiOff className="h-4 w-4" /> : <RefreshCcw className="h-4 w-4 animate-spin" />}
          {conn === 'offline' ? 'Connection lost — scores may be delayed' : 'Reconnecting…'}
        </div>
      )}

      {/* Match header */}
      <div
        className="rounded-2xl p-6"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {match.venue ? `${match.venue}${match.court ? ' · ' + match.court : ''}` : 'Match'} · #{match.match_number ?? '—'}
          </p>
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
            style={
              isCompleted
                ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }
                : match.status === 'LIVE'
                ? { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)' }
            }
          >
            {isCompleted ? '✓ Completed' : match.status === 'LIVE' ? '● Live' : match.status}
          </span>
        </div>

        {/* Scoreboard */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Home */}
          <div className="text-center">
            <div
              className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black"
              style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}
            >
              {(home.short_name ?? home.name).slice(0, 3).toUpperCase()}
            </div>
            <p className="text-sm font-bold leading-tight">{home.name}</p>
          </div>

          {/* Sets score */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-3">
              <span
                className="text-5xl font-black tabular-nums"
                style={{ color: homeSets > awaySets ? '#f0f0f4' : 'rgba(255,255,255,0.4)' }}
              >
                {homeSets}
              </span>
              <span className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.2)' }}>–</span>
              <span
                className="text-5xl font-black tabular-nums"
                style={{ color: awaySets > homeSets ? '#f0f0f4' : 'rgba(255,255,255,0.4)' }}
              >
                {awaySets}
              </span>
            </div>
            <p className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>Sets</p>
          </div>

          {/* Away */}
          <div className="text-center">
            <div
              className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black"
              style={{ background: 'rgba(168,85,247,0.18)', color: '#c4b5fd' }}
            >
              {(away.short_name ?? away.name).slice(0, 3).toUpperCase()}
            </div>
            <p className="text-sm font-bold leading-tight">{away.name}</p>
          </div>
        </div>

        {/* Current set score */}
        {current && !isCompleted && (
          <div
            className="mt-5 rounded-xl px-5 py-4 text-center"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
          >
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(165,180,252,0.7)' }}>
              Set {current.set_number} · Target {current.target_points}
            </p>
            <div className="flex items-center justify-center gap-5">
              <span className="text-4xl font-black tabular-nums">{current.home_score}</span>
              <span className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.2)' }}>:</span>
              <span className="text-4xl font-black tabular-nums">{current.away_score}</span>
            </div>
          </div>
        )}

        {/* Winner banner */}
        {isCompleted && winner && (
          <div
            className="mt-5 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold"
            style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}
          >
            <Trophy className="h-4 w-4" />
            {winner.name} wins
          </div>
        )}
      </div>

      {/* Set-by-set breakdown */}
      {sets.filter((s) => s.status === 'COMPLETED').length > 0 && (
        <div className="mt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Set scores</p>
          <div className="flex flex-wrap gap-2">
            {sets.filter((s) => s.status === 'COMPLETED').map((s) => {
              const homeWon = s.winner_team_id === home.id;
              return (
                <div
                  key={s.set_number}
                  className="rounded-xl px-4 py-3 text-center"
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    minWidth: '80px',
                  }}
                >
                  <p className="mb-1 text-xs font-bold uppercase" style={{ color: 'rgba(255,255,255,0.35)' }}>Set {s.set_number}</p>
                  <p className="font-black tabular-nums">
                    <span style={{ color: homeWon ? '#f0f0f4' : 'rgba(255,255,255,0.4)' }}>{s.home_score}</span>
                    <span className="mx-1" style={{ color: 'rgba(255,255,255,0.2)' }}>–</span>
                    <span style={{ color: !homeWon ? '#f0f0f4' : 'rgba(255,255,255,0.4)' }}>{s.away_score}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
