import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Body, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { deriveCourt } from '@/lib/court';
import { useLiveMatch } from '@/lib/live';
import { useTheme } from '@/theme';

/** Public live scoreboard: sides and server follow the scorer's toss. */
export default function PublicMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { state, error, live } = useLiveMatch(id, 'get_public_match_state');

  if (!state) return <Screen>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { home_team: home, away_team: away, sets, match } = state;
  const completed = match.status === 'COMPLETED';
  const current = sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const court = deriveCourt(sets, current, home.id, away.id);
  const left = court.leftId === away.id ? away : home;
  const right = left === home ? away : home;
  const won = (teamId: string) => sets.filter((s) => s.winner_team_id === teamId).length;
  const points = (teamId: string) => (teamId === home.id ? current?.home_score : current?.away_score) ?? 0;
  const winner = match.winner_team_id === home.id ? home : match.winner_team_id === away.id ? away : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <StatusPill status={match.status} label={completed ? 'Final' : undefined} tone={completed ? 'success' : undefined} />
        {!live && !completed ? <StatusPill tone="warning" label="Reconnecting" /> : null}
      </View>
      <Card>
        {[left, right].map((team) => (
          <View key={team.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Heading small>{team.name}</Heading>
              {!completed && court.servingId === team.id ? <StatusPill tone="primary" label="Serving" /> : null}
            </View>
            <Text accessibilityLabel={`${team.name} sets won ${won(team.id)}`} style={{ color: t.textSecondary, fontSize: 20, fontWeight: '700' }}>{won(team.id)}</Text>
            {!completed ? <Text accessibilityLabel={`${team.name} points ${points(team.id)}`} style={{ color: t.text, fontSize: 44, fontWeight: '800', minWidth: 70, textAlign: 'right' }}>{points(team.id)}</Text> : null}
          </View>
        ))}
        {!completed && current ? <Body muted>Set {current.set_number} · to {current.target_points} · Best of {sets.length}</Body> : null}
        {completed && winner ? <Body style={{ color: t.warning, fontWeight: '700' }}>{winner.name} wins</Body> : null}
      </Card>
      <Card>
        <Body muted>Sets</Body>
        {sets.filter((s) => s.status !== 'PENDING' || s.home_score + s.away_score > 0).map((s) => (
          <View key={s.set_number} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Body muted>Set {s.set_number}</Body>
            <Body>{s.home_score} – {s.away_score}</Body>
          </View>
        ))}
        <Body muted>{home.name} on the left side of these scores.</Body>
      </Card>
    </Screen>
  );
}
