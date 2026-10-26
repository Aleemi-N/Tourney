import { CheckCircle2, Circle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Checkin = { team_id: string; checked_in_at: string };

/** Which teams have checked in for a match. */
export function useCheckins(matchId: string) {
  const [items, setItems] = useState<Checkin[]>([]);
  const reload = useCallback(async () => {
    const { data } = await api.rpc('get_match_checkins', { p_match_id: matchId });
    setItems((data ?? []) as unknown as Checkin[]);
  }, [matchId]);
  useEffect(() => { void reload(); }, [reload]);
  return { items, reload };
}

/** Check-in status of both teams. `canAct` lists the teams the viewer may check in (others are read-only). */
export function CheckInStrip({ matchId, teams, canAct, scheduledAt, onWalkover }: {
  matchId: string; teams: { id: string; name: string }[]; canAct: string[]; scheduledAt?: string | null; onWalkover?: (winnerTeamId: string, absentName: string) => void;
}) {
  const t = useTheme();
  const { items, reload } = useCheckins(matchId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = (id: string) => items.some((c) => c.team_id === id);
  const overdue = !!scheduledAt && Date.now() > new Date(scheduledAt).getTime() + 15 * 60000;
  const absent = teams.filter((x) => !done(x.id));
  const present = teams.filter((x) => done(x.id));

  async function toggle(teamId: string) {
    setBusy(teamId); setError(null);
    const { error: e } = await api.rpc(done(teamId) ? 'undo_check_in' : 'check_in_team', { p_match_id: matchId, p_team_id: teamId });
    setBusy(null);
    if (e) return setError(e.message);
    await reload();
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Check-in</Text>
      {teams.map((team) => (
        <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {done(team.id) ? <CheckCircle2 size={18} color={t.success} /> : <Circle size={18} color={overdue ? t.warning : t.textMuted} />}
          <Text style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '600' }}>{team.name}</Text>
          <Text style={{ color: done(team.id) ? t.success : overdue ? t.warning : t.textMuted, fontSize: 12, fontWeight: '700' }}>{done(team.id) ? 'Checked in' : overdue ? 'Overdue' : 'Not yet'}</Text>
          {canAct.includes(team.id) ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${done(team.id) ? 'Undo check-in for' : 'Check in'} ${team.name}`} disabled={busy !== null} onPress={() => void toggle(team.id)} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Text style={{ color: t.primary, fontSize: 13, fontWeight: '700' }}>{busy === team.id ? '…' : done(team.id) ? 'Undo' : 'Check in'}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {onWalkover && overdue && present.length === 1 && absent.length === 1 ? (
        <Button tone="secondary" title={`${absent[0].name} did not check in: walkover to ${present[0].name}`} onPress={() => onWalkover(present[0].id, absent[0].name)} />
      ) : null}
    </View>
  );
}
