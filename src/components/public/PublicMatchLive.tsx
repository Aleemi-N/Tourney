'use client';

/**
 * PublicMatchLive — Client component for live match spectating.
 *
 * Subscribes to the match_sets table via Supabase Realtime to receive
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
import { cardClasses } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { cn, teamColorStyle } from '@/lib/utils';


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
  /** Team colours from public_team_view, used for the team badges. */
  homeColor?: string | null;
  awayColor?: string | null;
}


function setsWon(sets: SetState[], teamId: string) {
  return sets.filter((s) => s.winner_team_id === teamId && s.status === 'COMPLETED').length;
}

function activeSet(sets: SetState[]): SetState | null {
  return sets.find((s) => s.status === 'LIVE') ?? sets.find((s) => s.status === 'PENDING') ?? null;
}

type ConnectionStatus = 'connected' | 'connecting' | 'offline';

export function PublicMatchLive({ matchId, initialState, tvMode = false, homeColor, awayColor }: Props) {
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
        { event: '*', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` },
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

  const completedSets = sets.filter((s) => s.status === 'COMPLETED');
  const venueLabel = match.venue ? `${match.venue}${match.court ? ` · Court ${match.court}` : ''}` : 'Match';

  // ── TV / projector mode: always dark, minimal, huge numerals ────────────────
  if (tvMode) {
    return (
      <div data-theme="dark" className="fixed inset-0 flex flex-col items-center justify-center bg-background text-text-primary" role="region" aria-label="Live scoreboard">
        <p className="absolute right-6 top-6 flex items-center gap-2 text-sm font-semibold text-text-secondary">
          <span className={cn('h-2.5 w-2.5 rounded-full', conn === 'connected' ? 'bg-success' : conn === 'offline' ? 'bg-danger' : 'bg-warning')} aria-hidden="true" />
          {conn === 'connected' ? 'Live' : conn === 'offline' ? 'Offline' : 'Connecting'}
        </p>

        <p className="mb-8 text-sm font-semibold uppercase tracking-[0.25em] text-text-muted">
          {venueLabel} · #{match.match_number ?? '—'}
        </p>

        <div className="grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-8 px-8">
          <TvTeam team={home} sets={homeSets} leading={homeSets > awaySets} color={homeColor} />
          <div className="flex flex-col items-center gap-4">
            {current && !isCompleted ? (
              <div className="text-center">
                <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-text-muted">Set {current.set_number}</p>
                <p className="text-5xl font-bold tabular-nums">
                  {current.home_score}
                  <span className="mx-2 text-text-muted">:</span>
                  {current.away_score}
                </p>
              </div>
            ) : null}
            {winner && isCompleted ? (
              <p className="flex flex-col items-center gap-2 text-center text-lg font-semibold text-warning">
                <Trophy className="h-8 w-8" aria-hidden="true" />
                {winner.name} wins
              </p>
            ) : null}
          </div>
          <TvTeam team={away} sets={awaySets} leading={awaySets > homeSets} color={awayColor} />
        </div>

        {completedSets.length > 0 ? (
          <div className="mt-12 flex flex-wrap justify-center gap-3">
            {completedSets.map((s) => (
              <SetChip key={s.set_number} set={s} homeId={home.id} large />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {conn !== 'connected' ? (
        <p
          role="status"
          className={cn(
            'flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold',
            conn === 'offline' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/30 bg-warning/10 text-warning',
          )}
        >
          {conn === 'offline' ? <WifiOff className="h-4 w-4" aria-hidden="true" /> : <RefreshCcw className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {conn === 'offline' ? 'Connection lost — scores may be delayed' : 'Reconnecting…'}
        </p>
      ) : null}

      <section className={`${cardClasses} p-5 sm:p-6`} aria-label="Scoreboard">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-text-muted">
            {venueLabel} · #{match.match_number ?? '—'}
          </p>
          <StatusPill status={match.status} />
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamBadge team={home} color={homeColor} />
          <div className="flex flex-col items-center">
            <p className="flex items-center gap-3 text-5xl font-bold tabular-nums">
              <span className={homeSets >= awaySets ? 'text-text-primary' : 'text-text-muted'}>{homeSets}</span>
              <span className="text-xl text-text-muted">–</span>
              <span className={awaySets >= homeSets ? 'text-text-primary' : 'text-text-muted'}>{awaySets}</span>
            </p>
            <p className="text-xs font-medium text-text-muted">Sets</p>
          </div>
          <TeamBadge team={away} color={awayColor} />
        </div>

        {current && !isCompleted ? (
          <div className="mt-5 rounded-xl bg-surface-muted px-5 py-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Set {current.set_number} · to {current.target_points}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums">
              {current.home_score}
              <span className="mx-3 text-xl text-text-muted">:</span>
              {current.away_score}
            </p>
          </div>
        ) : null}

        {isCompleted && winner ? (
          <p className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-warning/10 py-3 text-sm font-semibold text-warning">
            <Trophy className="h-4 w-4" aria-hidden="true" />
            {winner.name} wins
          </p>
        ) : null}
      </section>

      {completedSets.length > 0 ? (
        <section aria-labelledby="set-scores">
          <h2 id="set-scores" className="mb-2 text-sm font-semibold text-text-secondary">Set scores</h2>
          <div className="flex flex-wrap gap-2">
            {completedSets.map((s) => (
              <SetChip key={s.set_number} set={s} homeId={home.id} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TeamBadge({ team, color }: { team: MatchTeam; color?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary" style={teamColorStyle(color)}>
        {(team.short_name ?? team.name).slice(0, 3).toUpperCase()}
      </span>
      <span className="text-sm font-semibold leading-tight text-text-primary">{team.name}</span>
    </div>
  );
}

function TvTeam({ team, sets, leading, color }: { team: MatchTeam; sets: number; leading: boolean; color?: string | null }) {
  const style = teamColorStyle(color);
  return (
    <div className="text-center">
      <p className="mb-4 inline-flex rounded-xl bg-primary/15 px-4 py-1.5 text-2xl font-bold uppercase tracking-widest text-primary" style={style}>
        {team.short_name ?? team.name}
      </p>
      <p className={cn('text-[clamp(6rem,20vw,14rem)] font-bold leading-none tabular-nums', leading ? 'text-text-primary' : 'text-text-muted')}>{sets}</p>
    </div>
  );
}

function SetChip({ set, homeId, large = false }: { set: SetState; homeId: string; large?: boolean }) {
  const homeWon = set.winner_team_id === homeId;
  return (
    <div className={cn(cardClasses, 'min-w-20 text-center', large ? 'px-5 py-3' : 'px-4 py-2.5')}>
      <p className="text-xs font-semibold uppercase text-text-muted">Set {set.set_number}</p>
      <p className={cn('font-bold tabular-nums', large ? 'text-2xl' : 'text-base')}>
        <span className={homeWon ? 'text-text-primary' : 'text-text-muted'}>{set.home_score}</span>
        <span className="mx-1.5 text-text-muted">–</span>
        <span className={!homeWon ? 'text-text-primary' : 'text-text-muted'}>{set.away_score}</span>
      </p>
    </div>
  );
}
