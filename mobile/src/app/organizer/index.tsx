import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Body, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrganizerTournaments } from '@/lib/organizer';

export default function OrganizerHome() {
  const { session } = useAuth();
  const { tournaments, error } = useOrganizerTournaments(session?.user.id);
  const [pending, setPending] = useState<Record<string, number>>({});

  // How many registrations and applications wait for a decision, per tournament.
  useEffect(() => {
    if (!tournaments?.length) return;
    (async () => {
      const entries = await Promise.all(tournaments.map(async (t) => {
        const [p, o] = await Promise.all([
          api.from('player_tournament_registrations').select('id', { count: 'exact', head: true }).eq('tournament_id', t.id).in('status', ['PENDING', 'CHANGES_REQUESTED']),
          api.from('team_owner_applications').select('id', { count: 'exact', head: true }).eq('tournament_id', t.id).in('status', ['PENDING', 'CHANGES_REQUESTED']),
        ]);
        return [t.id, (p.count ?? 0) + (o.count ?? 0)] as const;
      }));
      setPending(Object.fromEntries(entries));
    })();
  }, [tournaments]);

  return (
    <Screen>
      <Heading>Your tournaments</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {tournaments === null && !error ? <Loading /> : null}
      {tournaments?.length === 0 ? <Body muted>You do not organize any tournaments.</Body> : null}
      {tournaments?.map((t) => (
        <Link key={t.id} href={{ pathname: '/organizer/[id]', params: { id: t.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${t.name}, ${pending[t.id] ?? 0} waiting for review`}>
            <Card>
              <Heading small>{t.name}</Heading>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <StatusPill status={t.status} />
                {pending[t.id] ? <Body>{pending[t.id]} waiting for review</Body> : <Body muted>Nothing waiting</Body>}
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
