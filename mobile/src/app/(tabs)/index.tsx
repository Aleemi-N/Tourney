import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Body, Card, ErrorText, Heading, Loading, Pill, Screen } from '@/components/ui';
import { api } from '@/lib/api';

type Tournament = { id: string; name: string; slug: string; status: string; venue: string | null; start_date: string | null };

export default function TournamentsScreen() {
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,slug,status,venue,start_date').order('start_date', { ascending: false })
      .then(({ data, error: e }) => (e ? setError(e.message) : setItems(data as Tournament[])));
  }, []);

  return (
    <Screen>
      <Heading>Tournaments</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items === null && !error ? <Loading /> : null}
      {items?.length === 0 ? <Body muted>No public tournaments yet.</Body> : null}
      {items?.map((t) => (
        <Link key={t.id} href={{ pathname: '/t/[slug]', params: { slug: t.slug } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${t.name}, ${t.status}`}>
            <Card>
              <Heading>{t.name}</Heading>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pill label={t.status === 'LIVE' ? 'Live' : t.status.toLowerCase()} tone={t.status === 'LIVE' ? 'live' : 'neutral'} />
                {t.venue ? <Body muted>{t.venue}</Body> : null}
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
