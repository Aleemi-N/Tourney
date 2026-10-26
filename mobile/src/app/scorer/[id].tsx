import { router, useLocalSearchParams } from 'expo-router';
import { Clock, Undo2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useScoreQueue } from '@/lib/score-queue';
import { MvpPicker, ScorerLineups, useLineups } from '@/components/lineups';
import { ScoreFix } from '@/components/score-fix';
import { PortalShell } from '@/components/shell';
import { Text } from '@/components/text';
import { Body, Button, Card, ErrorText, Heading, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { deriveCourt } from '@/lib/court';
import { useLiveMatch, type Team } from '@/lib/live';
import { onColor, radius, tint, useTheme } from '@/theme';

const HOME_COLOR = '#4f46e5';
const AWAY_COLOR = '#0f766e';

/** A team's short name in its colour, like the web TeamChip. */
function TeamChip({ team, color }: { team: Team; color: string }) {
  return (
    <View style={{ backgroundColor: color, borderRadius: radius.md, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: onColor(color), fontSize: 12, fontWeight: '700' }}>{(team.short_name ?? team.name).slice(0, 4).toUpperCase()}</Text>
    </View>
  );
}

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
  const queue = useScoreQueue(id, async () => { await refresh(); });
  const mvp = useLineups(id, state?.match.status ?? '');
  const back = (
    <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/matches'))} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>← My matches</Text>
    </Pressable>
  );

  if (!state) return <PortalShell role="Scorer" home={false}>{back}{loadError ? <ErrorText>{loadError}</ErrorText> : <Loading />}</PortalShell>;
  const { home_team: home, away_team: away, sets, match } = state;
  const completed = match.status === 'COMPLETED';
  const active = completed
    ? [...sets].reverse().find((s) => s.status === 'COMPLETED') ?? sets[sets.length - 1]
    : sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const court = deriveCourt(sets, active, home.id, away.id);
  const left = court.leftId === away.id ? away : home;
  const right = left === home ? away : home;
  const colorOf = (team: Team) => (team.id === home.id ? HOME_COLOR : AWAY_COLOR);
  const scoreOf = (team: Team) => ((team.id === home.id ? active?.home_score : active?.away_score) ?? 0) + (queue.teamCounts[team.id] ?? 0);
  const won = (team: Team) => sets.filter((s) => s.winner_team_id === team.id).length;
  const timeoutsUsed = (team: Team) => (team.id === home.id ? state.timeouts?.home_used : state.timeouts?.away_used) ?? 0;
  const maxTimeouts = state.timeouts?.max_per_set ?? 2;
  const timeoutRunning = !!state.timeouts?.active && state.timeouts.active.remaining_seconds > 0;
  const locked = busy || completed || timeoutRunning;
  const startedPoints = sets.some((s) => s.home_score + s.away_score > 0);
  const switchNow = court.switchedSides && active && Math.max(active.home_score, active.away_score) === Math.ceil(active.target_points / 2);

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

  const award = (team: Team) => queue.award(team.id);
  const saveToss = () => run(async () => {
    const result = await api.rpc('set_match_setup', { p_match_id: match.id, p_set_number: active.set_number, p_left_team_id: tossLeft ?? court.leftId ?? home.id, p_first_serve_team_id: tossServe ?? court.servingId ?? home.id });
    if (!result.error) setEditingToss(false);
    return result;
  });

  const choice = (label: string, value: string | null, set: (id: string) => void) => (
    <View style={{ gap: 8 }}>
      <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[home, away].map((team) => {
          const selected = (value ?? home.id) === team.id;
          return (
            <Pressable key={team.id} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label}: ${team.name}`} onPress={() => set(team.id)}
              style={{ flex: 1, minHeight: 48, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', padding: 8, backgroundColor: selected ? colorOf(team) : t.surface, borderWidth: 1, borderColor: selected ? colorOf(team) : t.border }}>
              <Text style={{ fontWeight: '600', color: selected ? onColor(colorOf(team)) : t.text, textAlign: 'center' }}>{team.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <PortalShell role="Scorer" home={false}>{back}
      {/* Header: match context and connection state */}
      <Card>
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Match {match.match_number ?? '—'}{match.court ? ` · Court ${match.court}` : ''}
        </Text>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{home.name} <Text style={{ color: t.textMuted, fontWeight: '400' }}>vs</Text> {away.name}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill status={match.status} />
          {!live ? <StatusPill tone="warning" label="Reconnecting" /> : <StatusPill tone="success" label="Connected" />}
        </View>
      </Card>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {queue.dropped ? <ErrorText>{queue.dropped}</ErrorText> : null}
      {queue.pending > 0 || !queue.online ? (
        <View accessibilityRole="alert" style={{ backgroundColor: tint(t.warning, 0.12), borderRadius: radius.xl, padding: 12, gap: 2 }}>
          <Text style={{ color: t.warning, fontWeight: '800' }}>{queue.online ? `Sending ${queue.pending} point${queue.pending === 1 ? '' : 's'}…` : `No connection: ${queue.pending} point${queue.pending === 1 ? '' : 's'} saved on this phone`}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 12 }}>Keep scoring. Points are sent in order when the connection returns, and are kept if the app closes. The score shown includes them.</Text>
        </View>
      ) : null}

      {!completed && (court.needsSetup || editingToss) && active ? (
        <Card style={{ gap: 14 }}>
          <Heading small>Set {active.set_number}: sides and serve</Heading>
          {choice('Team on the left', tossLeft ?? court.leftId, setTossLeft)}
          {choice('Serves first', tossServe ?? court.servingId, setTossServe)}
          <Button title="Save" onPress={() => void saveToss()} loading={busy} />
        </Card>
      ) : null}

      {switchNow ? (
        <View style={{ backgroundColor: tint(t.warning, 0.1), borderRadius: radius.xl, padding: 12 }} accessibilityRole="alert">
          <Text style={{ color: t.warning, fontWeight: '700', textAlign: 'center' }}>Teams switch sides now</Text>
        </View>
      ) : null}

      {/* Score: sets won on top, then one big tinted button per team with a coloured top edge */}
      <Card style={{ padding: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TeamChip team={left} color={colorOf(left)} />
            <Text accessibilityLabel={`${left.name} sets won: ${won(left)}`} style={{ color: t.text, fontSize: 24, fontWeight: '700' }}>{won(left)}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>Set {active?.set_number ?? 1}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>to {active?.target_points ?? 25} · Best of {sets.length}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text accessibilityLabel={`${right.name} sets won: ${won(right)}`} style={{ color: t.text, fontSize: 24, fontWeight: '700' }}>{won(right)}</Text>
            <TeamChip team={right} color={colorOf(right)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[left, right].map((team) => {
            const serving = !completed && court.servingId === team.id;
            const color = colorOf(team);
            return (
              <Pressable key={team.id} disabled={locked} onPress={() => void award(team)}
                accessibilityRole="button" accessibilityLabel={`Award point to ${team.name}. Current score ${scoreOf(team)}${serving ? '. Serving' : ''}`}
                style={({ pressed }) => ({
                  flex: 1, minHeight: 250, borderRadius: radius['2xl'], borderWidth: 1, borderTopWidth: 6, borderColor: t.border, borderTopColor: color,
                  backgroundColor: tint(color, 0.08), paddingTop: 20, paddingBottom: 16, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'space-between',
                  opacity: locked ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
                })}>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={2} style={{ color: t.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{team.name}</Text>
                  {serving ? (
                    <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
                      <Text style={{ color: onColor(color), fontSize: 12, fontWeight: '600' }}>Serving</Text>
                    </View>
                  ) : <View style={{ height: 22 }} />}
                </View>
                <Text style={{ color: t.text, fontSize: 80, fontWeight: '700', lineHeight: 88 }}>{scoreOf(team)}</Text>
                <View style={{ backgroundColor: color, borderRadius: 999, minHeight: 44, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: onColor(color), fontSize: 14, fontWeight: '600' }}>+1 point</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[left, right].map((team) => {
          const disabled = locked || timeoutsUsed(team) >= maxTimeouts;
          return (
            <Pressable key={team.id} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Call timeout for ${team.name}`}
              onPress={() => void run(() => api.rpc('call_match_timeout', { p_match_id: match.id, p_team_id: team.id }))}
              style={{ flex: 1, minHeight: 56, borderRadius: radius.xl, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={16} color={t.text} />
                <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>Timeout</Text>
              </View>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{timeoutsUsed(team)} of {maxTimeouts} used</Text>
            </Pressable>
          );
        })}
      </View>
      {timeoutRunning ? <Button title="End timeout" onPress={() => void run(() => api.rpc('end_match_timeout', { p_match_id: match.id }))} /> : null}
      {(startedPoints || queue.pending > 0) && !completed ? (
        <Button tone="secondary" title="Undo last point" disabled={busy || timeoutRunning} icon={<Undo2 size={18} color={t.text} />}
          onPress={() => { if (!queue.undoPending()) void run(() => api.rpc('undo_last_score_event', { p_match_id: match.id })); }} />
      ) : null}

      {/* Sets history */}
      <Card style={{ paddingVertical: 4 }}>
        <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600', paddingTop: 12, paddingBottom: 4 }}>Sets</Text>
        {sets.map((s, index) => (
          <View key={s.set_number} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: t.border }}>
            <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '500', width: 56 }}>Set {s.set_number}</Text>
            <Text style={{ color: s.status === 'PENDING' ? t.textMuted : t.text, fontSize: 16, fontWeight: '700' }}>{s.home_score} – {s.away_score}</Text>
            <View style={{ width: 90, alignItems: 'flex-end' }}>
              {s.winner_team_id ? <TeamChip team={s.winner_team_id === home.id ? home : away} color={colorOf(s.winner_team_id === home.id ? home : away)} />
                : s.status === 'LIVE' ? <StatusPill status="LIVE" /> : <Text style={{ color: t.textMuted, fontSize: 12 }}>Not started</Text>}
            </View>
          </View>
        ))}
      </Card>

      {active ? (
        <ScorerLineups matchId={match.id} setNumber={active.set_number} teams={[home, away]} colors={{ [home.id]: HOME_COLOR, [away.id]: AWAY_COLOR }} servingId={court.servingId}
          started={active.home_score + active.away_score > 0} disabled={busy || completed || timeoutRunning} refreshKey={sets.map((x) => `${x.home_score}-${x.away_score}-${x.status}`).join('|')} onChanged={refresh} />
      ) : null}
      {completed ? <MvpPicker matchId={match.id} mvp={mvp.data?.mvp ?? null} onChanged={mvp.reload} /> : null}
      <ScoreFix matchId={match.id} sets={sets} homeName={home.name} awayName={away.name} disabled={busy || timeoutRunning} onChanged={refresh} />
      {!completed && !court.needsSetup && !editingToss ? (
        <Button tone="ghost" title="Sides & serve" onPress={() => { setTossLeft(court.leftId); setTossServe(court.servingId); setEditingToss(true); }} />
      ) : null}
      <Body muted>Teams are shown on the sides chosen at the toss.</Body>
    </PortalShell>
  );
}
