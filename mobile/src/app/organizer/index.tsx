import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { PortalShell, portalCard } from '@/components/shell';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrganizerTournaments } from '@/lib/organizer';
import { useTheme } from '@/theme';

type Counts = { players: number; applications: number; teams: number; format: string | null; date: string | null };

/** The organizer dashboard: one card per tournament with its numbers. */
export default function OrganizerHome() {
  const { session } = useAuth();
  const t = useTheme();
  const { tournaments, error } = useOrganizerTournaments(session?.user.id);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [name, setName] = useState('');

  useEffect(() => {
    if (!session) return;
    api.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => setName(((data?.full_name as string | undefined) ?? '').split(' ')[0]));
  }, [session]);

  useEffect(() => {
    if (!tournaments?.length) return;
    (async () => {
      const entries = await Promise.all(tournaments.map(async (item) => {
        const count = (table: string) => api.from(table).select('id', { count: 'exact', head: true }).eq('tournament_id', item.id);
        const [players, apps, teams, info] = await Promise.all([
          count('player_tournament_registrations'), count('team_owner_applications'), count('teams'),
          api.from('tournaments').select('format,start_date').eq('id', item.id).maybeSingle(),
        ]);
        return [item.id, { players: players.count ?? 0, applications: apps.count ?? 0, teams: teams.count ?? 0, format: (info.data?.format as string | null) ?? null, date: (info.data?.start_date as string | null) ?? null }] as const;
      }));
      setCounts(Object.fromEntries(entries));
    })();
  }, [tournaments]);

  const row = (label: string, value: string | number) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 28 }}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );

  return (
    <PortalShell role="Organizer" home={false}>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={{ color: t.primary, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.9 }}>Welcome back{name ? `, ${name}` : ''}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 16 }}>Manage your tournaments and events.</Text>
      </View>
      <Button title="Create Tournament" onPress={() => router.push('/organizer/new')} />
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700', marginTop: 8 }}>Your Tournaments</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {tournaments === null && !error ? <Loading /> : null}
      {tournaments?.length === 0 ? <Empty text="You do not organize any tournaments." /> : null}
      {tournaments?.map((item) => {
        const c = counts[item.id];
        return (
          <Pressable key={item.id} accessibilityRole="link" accessibilityLabel={`${item.name}, ${c?.applications ?? 0} applications`} onPress={() => (item.status === 'DRAFT' ? router.push({ pathname: '/organizer/new', params: { id: item.id } }) : router.push({ pathname: '/organizer/[id]', params: { id: item.id } }))} style={[portalCard(t), { padding: 24, gap: 6 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Text style={{ flex: 1, color: t.text, fontSize: 19, lineHeight: 25, fontWeight: '700' }}>{item.name}</Text>
              <StatusPill status={item.status} tone={item.status === 'LIVE' ? 'primary' : 'primary'} />
            </View>
            {row('Format', c?.format ? c.format.toUpperCase() : '—')}
            {row('Players', c?.players ?? '—')}
            {row('Applications', c?.applications ?? '—')}
            {row('Teams', c?.teams ?? '—')}
            <View style={{ height: 1, backgroundColor: t.border, marginVertical: 8 }} />
            {row('Date', c?.date ? new Date(c.date).toLocaleDateString('en-GB') : '—')}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <Text style={{ color: t.primary, fontSize: 15, fontWeight: '600' }}>Open Dashboard</Text>
              <ArrowRight size={16} color={t.primary} />
            </View>
          </Pressable>
        );
      })}
    </PortalShell>
  );
}
