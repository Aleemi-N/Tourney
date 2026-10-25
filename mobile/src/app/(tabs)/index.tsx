import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { Body, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';

type Tournament = { id: string; name: string; slug: string; status: string; venue: string | null; start_date: string | null };

export default function TournamentsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,slug,status,venue,start_date').order('start_date', { ascending: false })
      .then(({ data, error: e }) => (e ? setError(e.message) : setItems(data as Tournament[])));
  }, []);

  return (
    <Screen>
      <Heading eyebrow="Browse">Tournaments</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items === null && !error ? <Loading /> : null}
      {items?.length === 0 ? <Body muted>No public tournaments yet.</Body> : null}
      {items?.map((item) => (
        <Link key={item.id} href={{ pathname: '/t/[slug]', params: { slug: item.slug } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${item.name}, ${item.status}`}>
            <Card>
              <Heading small>{item.name}</Heading>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill status={item.status} />
                {item.venue ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MapPin size={14} color={t.textMuted} /><Body muted>{item.venue}</Body></View> : null}
              </View>
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
