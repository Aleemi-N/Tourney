import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Body, Button, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MatchState } from '@/lib/live';

/** Matches assigned to the signed-in scorer. */
export default function MyMatchesScreen() {
  const { session, ready } = useAuth();
  const [matches, setMatches] = useState<MatchState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data: assignments, error: e } = await api.from('match_scorers').select('match_id').eq('user_id', session.user.id);
    if (e) return setError(e.message);
    const states = await Promise.all((assignments ?? []).map(async (a) => {
      const { data } = await api.rpc('get_scorer_match_state', { p_match_id: a.match_id as string });
      return data as unknown as MatchState | null;
    }));
    setMatches(states.filter((s): s is MatchState => !!s));
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  if (!ready) return <Screen><Loading /></Screen>;
  if (!session) {
    return (
      <Screen>
        <Heading>My matches</Heading>
        <Body muted>Sign in to see the matches assigned to you.</Body>
        <Link href="/login" asChild><Button title="Sign in" onPress={() => {}} /></Link>
      </Screen>
    );
  }
  return (
    <Screen>
      <Heading>Assigned matches</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {matches === null && !error ? <Loading /> : null}
      {matches?.length === 0 ? <Body muted>No matches are assigned to you.</Body> : null}
      {matches?.map((m) => (
        <Link key={m.match.id} href={{ pathname: '/scorer/[id]', params: { id: m.match.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${m.home_team.name} versus ${m.away_team.name}`}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body muted>Match {m.match.match_number ?? '—'}</Body>
                <StatusPill status={m.match.status} />
              </View>
              <Heading small>{m.home_team.name} vs {m.away_team.name}</Heading>
              {m.match.venue ? <Body muted>{m.match.venue}{m.match.court ? ` · Court ${m.match.court}` : ''}</Body> : null}
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
