import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Heading, Loading, Pill, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { deriveCourt } from '@/lib/court';
import { useLiveMatch, type Team } from '@/lib/live';
import { onColor, useTheme } from '@/theme';

const HOME_COLOR = '#4f46e5';
const AWAY_COLOR = '#0f766e';

export default function ScorerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { state, error: loadError, live, refresh } = useLiveMatch(id, 'get_scorer_match_state');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingToss, setEditingToss] = useState(false);
  const [tossLeft, setTossLeft] = useState<string | null>(null);
  const [tossServe, setTossServe] = useState<string | null>(null);
  const working = useRef(false);

  if (!state) return <Screen>{loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}</Screen>;
  const { home_team: home, away_team: away, sets, match } = state;
  const completed = match.status === 'COMPLETED';
  const active = completed
    ? [...sets].reverse().find((s) => s.status === 'COMPLETED') ?? sets[sets.length - 1]
    : sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const court = deriveCourt(sets, active, home.id, away.id);
  const left = court.leftId === away.id ? away : home;
  const right = left === home ? away : home;
  const colorOf = (team: Team) => (team.id === home.id ? HOME_COLOR : AWAY_COLOR);
  const scoreOf = (team: Team) => (team.id === home.id ? active?.home_score : active?.away_score) ?? 0;
  const won = (team: Team) => sets.filter((s) => s.winner_team_id === team.id).length;
  const timeoutsUsed = (team: Team) => (team.id === home.id ? state.timeouts?.home_used : state.timeouts?.away_used) ?? 0;
  const maxTimeouts = state.timeouts?.max_per_set ?? 2;
  const timeoutRunning = !!state.timeouts?.active && state.timeouts.active.remaining_seconds > 0;
  const locked = busy || completed || timeoutRunning;
  const startedPoints = sets.some((s) => s.home_score + s.away_score > 0);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if (working.current) return; // a second tap while one is in flight would double-score
    working.current = true;
    setBusy(true);
    setError(null);
    const { error: e } = await action();
    working.current = false;
    setBusy(false);
    if (e) setError(e.message.includes('timeout') ? 'Scoring paused: a timeout is running.' : e.message);
    await refresh();
  }

  const award = (team: Team) => run(() => api.rpc('award_point', { p_match_id: match.id, p_team_id: team.id, p_idempotency_key: `${Date.now()}-${Math.random().toString(36).slice(2)}` }));
  const saveToss = () => run(async () => {
    const result = await api.rpc('set_match_setup', { p_match_id: match.id, p_set_number: active.set_number, p_left_team_id: tossLeft ?? home.id, p_first_serve_team_id: tossServe ?? home.id });
    if (!result.error) setEditingToss(false);
    return result;
  });

  const choice = (label: string, value: string | null, set: (id: string) => void) => (
    <View style={{ gap: 8 }}>
      <Body muted>{label}</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[home, away].map((team) => {
          const selected = (value ?? home.id) === team.id;
          return (
            <Pressable key={team.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label}: ${team.name}`} onPress={() => set(team.id)}
              style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: selected ? colorOf(team) : t.surfaceMuted }}>
              <Text style={{ fontWeight: '600', color: selected ? onColor(colorOf(team)) : t.text, textAlign: 'center' }}>{team.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {completed ? <Pill label="Final" tone="success" /> : <Pill label={match.status === 'LIVE' ? 'Live' : match.status.toLowerCase()} tone={match.status === 'LIVE' ? 'live' : 'neutral'} />}
        {!live ? <Pill label="Reconnecting" /> : null}
        {active ? <Body muted>Set {active.set_number} · to {active.target_points} · Best of {sets.length}</Body> : null}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {!completed && (court.needsSetup || editingToss) && active ? (
        <Card>
          <Heading>Set {active.set_number}: sides and serve</Heading>
          {choice('Team on the left', tossLeft ?? court.leftId, setTossLeft)}
          {choice('Serves first', tossServe ?? court.servingId, setTossServe)}
          <Button title="Save" onPress={() => void saveToss()} loading={busy} />
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[left, right].map((team) => (
          <Pressable key={team.id} disabled={locked} onPress={() => void award(team)}
            accessibilityRole="button" accessibilityLabel={`Award point to ${team.name}. Current score ${scoreOf(team)}${court.servingId === team.id ? '. Serving' : ''}`}
            style={({ pressed }) => ({ flex: 1, minHeight: 260, borderRadius: 20, padding: 12, alignItems: 'center', justifyContent: 'space-between', opacity: locked ? 0.5 : pressed ? 0.88 : 1, backgroundColor: colorOf(team), borderWidth: 1, borderColor: t.border })}>
            <View style={{ alignItems: 'center', gap: 6 }}>
              <Text style={{ color: onColor(colorOf(team)), fontWeight: '700', fontSize: 16, textAlign: 'center' }} numberOfLines={2}>{team.name}</Text>
              <Text style={{ color: onColor(colorOf(team)), fontSize: 13, height: 18 }}>{!completed && court.servingId === team.id ? 'Serving' : ''}</Text>
            </View>
            <Text style={{ color: onColor(colorOf(team)), fontSize: 84, fontWeight: '800' }}>{scoreOf(team)}</Text>
            <Text style={{ color: onColor(colorOf(team)), fontSize: 15, fontWeight: '600' }}>Sets {won(team)} · +1 point</Text>
          </Pressable>
        ))}
      </View>

      {court.switchedSides && active && Math.max(active.home_score, active.away_score) === Math.ceil(active.target_points / 2) ? (
        <Card><Body style={{ color: t.warning, fontWeight: '700' }}>Teams switch sides now</Body></Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[left, right].map((team) => (
          <View key={team.id} style={{ flex: 1 }}>
            <Button tone="secondary" title={`Timeout ${timeoutsUsed(team)}/${maxTimeouts}`} accessibilityLabel={`Call timeout for ${team.name}`}
              disabled={locked || timeoutsUsed(team) >= maxTimeouts} onPress={() => void run(() => api.rpc('call_match_timeout', { p_match_id: match.id, p_team_id: team.id }))} />
          </View>
        ))}
      </View>
      {timeoutRunning ? <Button title="End timeout" onPress={() => void run(() => api.rpc('end_match_timeout', { p_match_id: match.id }))} /> : null}
      {startedPoints && !completed ? <Button tone="secondary" title="Undo last point" disabled={busy || timeoutRunning} onPress={() => void run(() => api.rpc('undo_last_score_event', { p_match_id: match.id }))} /> : null}
      {!completed && !court.needsSetup && !editingToss ? <Button tone="secondary" title="Sides & serve" onPress={() => { setTossLeft(court.leftId); setTossServe(court.servingId); setEditingToss(true); }} /> : null}
    </Screen>
  );
}
