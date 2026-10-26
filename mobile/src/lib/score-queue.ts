import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';

type Item = { key: string; teamId: string };

const storageKey = (matchId: string) => `tourny-score-queue-${matchId}`;
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

/**
 * Points are queued on the phone and sent one by one, in order, each with its own idempotency key. A tap is never lost:
 * with no connection the queue waits (and is kept if the app closes) and is sent when the connection returns. Because the
 * server applies every point with its key at most once, retrying after a lost reply cannot score a point twice.
 */
export function useScoreQueue(matchId: string, onSynced: () => Promise<void>) {
  const queue = useRef<Item[]>([]);
  const flushing = useRef(false);
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [online, setOnline] = useState(true);
  const [dropped, setDropped] = useState<string | null>(null);

  const publish = useCallback(() => {
    const counts: Record<string, number> = {};
    for (const i of queue.current) counts[i.teamId] = (counts[i.teamId] ?? 0) + 1;
    setTeamCounts(counts);
    AsyncStorage.setItem(storageKey(matchId), JSON.stringify(queue.current)).catch(() => {});
  }, [matchId]);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    let sent = false;
    while (queue.current.length > 0) {
      const item = queue.current[0];
      const { error } = await api.rpc('award_point', { p_match_id: matchId, p_team_id: item.teamId, p_idempotency_key: item.key });
      // A database rule that refuses the point has a code; a missing connection or a gateway failure has none.
      if (error && !error.code) { setOnline(false); break; }
      setOnline(true);
      queue.current.shift();
      sent = true;
      if (error) setDropped(error.message.includes('timeout') ? 'A point was not applied: a timeout is running.' : `A point was not applied: ${error.message}`);
      publish();
    }
    flushing.current = false;
    if (sent) await onSynced();
  }, [matchId, onSynced, publish]);

  // Restore points that were queued before the app closed.
  useEffect(() => {
    AsyncStorage.getItem(storageKey(matchId)).then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as Item[];
      if (saved.length) { queue.current = [...saved, ...queue.current]; publish(); void flush(); }
    }).catch(() => {});
  }, [matchId, publish, flush]);

  // Keep trying while anything is waiting, and when the app comes back to the foreground.
  useEffect(() => {
    const timer = setInterval(() => { if (queue.current.length > 0) void flush(); }, 3000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && queue.current.length > 0) void flush(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [flush]);

  const award = useCallback((teamId: string) => {
    setDropped(null);
    queue.current.push({ key: newKey(), teamId });
    publish();
    void flush();
  }, [publish, flush]);

  /** Takes back the last point that has not been sent yet. Returns false when nothing is waiting. */
  const undoPending = useCallback(() => {
    if (queue.current.length === 0) return false;
    queue.current.pop();
    publish();
    return true;
  }, [publish]);

  const pending = Object.values(teamCounts).reduce((a, b) => a + b, 0);
  return { award, undoPending, teamCounts, pending, online, dropped, clearDropped: () => setDropped(null) };
}
