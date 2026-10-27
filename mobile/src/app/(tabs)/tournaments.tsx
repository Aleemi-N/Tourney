import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Calendar, MapPin } from 'lucide-react-native';
import { Choice, Field } from '@/components/form';
import { Body, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';

type Tournament = { id: string; name: string; slug: string; status: string; venue: string | null; start_date: string | null; end_date: string | null };

const STATUS = [
  { value: 'ALL', label: 'All' }, { value: 'LIVE', label: 'Live now' }, { value: 'REGISTRATION', label: 'Open for registration' },
  { value: 'UPCOMING', label: 'Upcoming' }, { value: 'COMPLETED', label: 'Finished' },
];
const WHEN = [{ value: 'ANY', label: 'Any time' }, { value: 'WEEK', label: 'This week' }, { value: 'MONTH', label: 'This month' }, { value: 'PAST', label: 'Past' }];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** The public directory: search by name or place, filter by status and date. */
export default function TournamentsScreen() {
  const t = useTheme();
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [when, setWhen] = useState('ANY');

  useEffect(() => {
    const timer = setTimeout(async () => {
      let q = api.from('public_tournament_view').select('id,name,slug,status,venue,start_date,end_date').order('start_date', { ascending: false });
      // Characters that have a meaning inside a PostgREST filter are dropped from the search text.
      const text = search.trim().replace(/[%*,()\\]/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) q = q.or(`name.ilike.*${text}*,venue.ilike.*${text}*`);
      if (status === 'UPCOMING') q = q.gte('start_date', ymd(new Date())); else if (status !== 'ALL') q = q.eq('status', status);
      const now = new Date();
      if (when === 'WEEK') { const end = new Date(now); end.setDate(end.getDate() + 7); q = q.lte('start_date', ymd(end)).gte('end_date', ymd(now)); }
      else if (when === 'MONTH') { const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); q = q.lte('start_date', ymd(end)).gte('end_date', ymd(new Date(now.getFullYear(), now.getMonth(), 1))); }
      else if (when === 'PAST') q = q.lt('end_date', ymd(now));
      const { data, error: e } = await q;
      if (e) return setError(e.message);
      setError(null);
      setItems(data as Tournament[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, status, when]);

  return (
    <Screen>
      <Heading eyebrow="Browse">Tournaments</Heading>
      <Field label="Search tournaments" value={search} onChangeText={setSearch} placeholder="Name or city" autoCapitalize="none" returnKeyType="search" />
      <Choice label="Status" value={status} options={STATUS} onChange={setStatus} />
      <Choice label="When" value={when} options={WHEN} onChange={setWhen} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {items === null && !error ? <Loading /> : null}
      {items?.length === 0 ? <Body muted>{search || status !== 'ALL' || when !== 'ANY' ? 'No tournaments match. Try a different search or filter.' : 'No public tournaments yet.'}</Body> : null}
      {items?.map((item) => (
        <Link key={item.id} href={{ pathname: '/t/[slug]', params: { slug: item.slug } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${item.name}, ${item.status}`}>
            <Card>
              <Heading small>{item.name}</Heading>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusPill status={item.status} />
                {item.venue ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><MapPin size={14} color={t.textMuted} /><Body muted>{item.venue}</Body></View> : null}
              </View>
              {item.start_date ? <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Calendar size={14} color={t.textMuted} /><Body muted>{day(item.start_date)}{item.end_date && item.end_date !== item.start_date ? ` – ${day(item.end_date)}` : ''}</Body></View> : null}
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}
