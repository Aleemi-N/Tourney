import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';

export type MatchSet = {
  id?: string; set_number: number; target_points: number; home_score: number; away_score: number; status: string; winner_team_id: string | null;
  left_team_id?: string | null; first_serve_team_id?: string | null; serving_team_id?: string | null;
};
export type Team = { id: string; name: string; short_name: string | null };
export type MatchState = {
  match: { id: string; status: string; match_number: number | null; venue: string | null; court: string | null; winner_team_id?: string | null; tournament_id?: string };
  home_team: Team; away_team: Team; sets: MatchSet[];
  timeouts?: { max_per_set: number; home_used: number; away_used: number; active: { id: string; team_id: string; remaining_seconds: number } | null };
};

/**
 * Loads a match through a state function and refreshes it whenever the match changes. Events are
 * only a signal: every update re-reads the authoritative state, so a missed event cannot leave
 * a stale score, and the app also refreshes when it returns to the foreground.
 */
export function useLiveMatch(matchId: string, fn: 'get_public_match_state' | 'get_scorer_match_state') {
  const [state, setState] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const { data, error: e } = await api.rpc(fn, { p_match_id: matchId });
    busy.current = false;
    if (e) setError(e.message); else { setError(null); setState(data as unknown as MatchState); }
  }, [fn, matchId]);

  useEffect(() => {
    void refresh();
    const channel = api.channel(`mobile-match-${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_events', filter: `match_id=eq.${matchId}` }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_timeouts', filter: `match_id=eq.${matchId}` }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, () => void refresh())
      .subscribe((status) => { setLive(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') void refresh(); });
    const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { void api.removeChannel(channel); appState.remove(); };
  }, [matchId, refresh]);

  return { state, error, live, refresh };
}
