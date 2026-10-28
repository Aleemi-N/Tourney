import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { Calendar, CalendarDays, ChartColumn, ChevronRight, List, MapPin, Radio, User, Users, Volleyball } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, View, type DimensionValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { Body, Button, Card, StatusPill } from '@/components/ui';
import { AnnouncementsCard } from '@/components/announcements';
import { TournamentAwards } from '@/components/awards';
import { FollowButton } from '@/components/follow-button';
import { Empty, Loading, shortOf, Sponsors, Tile, useTournament } from '@/components/tournament';
import { radius, tint, useTheme } from '@/theme';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);

/** The tournament's overview page: facts, live banner, teams and the Explore tiles. */
export default function TournamentOverview() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams, extras } = useTournament(slug);

  if (tournament === undefined) return <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}><Loading /></SafeAreaView>;
  if (tournament === null) return <SafeAreaView style={{ flex: 1, backgroundColor: t.background, padding: 16 }}><Empty text="This tournament is unavailable or no longer public." /></SafeAreaView>;

  const dates = [fmt(tournament.start_date), fmt(tournament.end_date)].filter(Boolean).join(' – ');
  const facts = [
    { icon: Calendar, label: 'Dates', value: dates },
    { icon: MapPin, label: 'Venue', value: tournament.venue },
    { icon: Users, label: 'Teams', value: `${teams.length} team${teams.length === 1 ? '' : 's'} registered` },
  ].filter((f) => f.value);
  const tiles = [
    { id: 'fixtures', icon: CalendarDays, title: 'Fixtures', text: 'Upcoming matches' }, { id: 'results', icon: List, title: 'Results', text: 'Completed scores' },
    { id: 'table', icon: ChartColumn, title: 'Table', text: 'League standings' }, { id: 'teams', icon: Users, title: 'Teams', text: 'All teams' },
    { id: 'players', icon: User, title: 'Players', text: 'Player roster' },
  ] as const;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>← Back to Tournaments</Text>
        </Pressable>
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Volleyball size={16} color={t.primary} />
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }}>{tournament.sport ?? 'Volleyball'}</Text>
          </View>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1 }}>{tournament.name}</Text>
          <FollowButton kind="TOURNAMENT" targetId={tournament.id} name="tournament" />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <StatusPill status={tournament.status} />
            {tournament.format ? <StatusPill tone="neutral" label={`${tournament.format[0] + tournament.format.slice(1).toLowerCase()} — Registered Teams`} /> : null}
          </View>
          {tournament.description ? <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24 }}>{tournament.description}</Text> : null}
        </View>

        {extras?.stream_url ? <Button title="Watch live" accessibilityLabel="Watch the live stream" onPress={() => void Linking.openURL(extras.stream_url as string)} /> : null}

        <Card style={{ padding: 0, gap: 0 }}>
          {facts.map((f, i) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
              <View style={{ width: 44, height: 44, borderRadius: radius.xl, backgroundColor: t.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><f.icon size={20} color={t.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>{f.label}</Text>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{f.value}</Text>
              </View>
            </View>
          ))}
        </Card>

        {tournament.status === 'LIVE' || tournament.status === 'REGISTRATION' ? (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/t/[slug]/live', params: { slug } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius['2xl'], borderWidth: 1, borderColor: tint(tournament.status === 'LIVE' ? t.live : t.success, 0.3), backgroundColor: tint(tournament.status === 'LIVE' ? t.live : t.success, 0.08) }}>
            <Radio size={26} color={tournament.status === 'LIVE' ? t.live : t.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: tournament.status === 'LIVE' ? t.live : t.success, fontSize: 17, fontWeight: '700' }}>{tournament.status === 'LIVE' ? 'Live now' : 'Registration is open'}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>{tournament.status === 'LIVE' ? 'Matches, auction and lot draw as they happen' : 'Join as a player or apply with a team'}</Text>
            </View>
            <ChevronRight size={20} color={t.textMuted} />
          </Pressable>
        ) : null}

        {tournament.status === 'REGISTRATION' ? (
          <View style={{ gap: 10 }}>
            <Link href={{ pathname: '/register/player/[slug]', params: { slug } }} asChild><Button title="Register as a player" onPress={() => {}} /></Link>
            <Link href={{ pathname: '/register/team/[slug]', params: { slug } }} asChild><Button tone="secondary" title="Apply with a team" onPress={() => {}} /></Link>
          </View>
        ) : null}

        <AnnouncementsCard tournamentId={tournament.id} />

        <TournamentAwards tournamentId={tournament.id} slug={slug} />

        {teams.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Teams</Text>
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/t/[slug]/teams', params: { slug } })} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>See all</Text></Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {teams.slice(0, 6).map((team) => (
                <View key={team.id} style={{ width: '48%' as DimensionValue, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.xl, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
                  <View style={{ width: 40, height: 40, borderRadius: radius.lg, backgroundColor: team.primary_color ?? t.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{shortOf(team)}</Text>
                  </View>
                  <Text numberOfLines={2} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '600' }}>{team.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Explore</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tiles.map((tile) => (
              <Pressable key={tile.id} accessibilityRole="link" accessibilityLabel={tile.title} onPress={() => router.push({ pathname: `/t/[slug]/${tile.id}`, params: { slug } })}
                style={{ width: '47.5%' as DimensionValue, padding: 16, gap: 10, borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
                <View style={{ width: 44, height: 44, borderRadius: radius.xl, backgroundColor: t.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}><tile.icon size={20} color={t.primary} /></View>
                <View>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{tile.title}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 14 }}>{tile.text}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
        <Sponsors sponsors={extras?.sponsors ?? []} />
        <Body muted>Built on the Tourny platform.</Body>
      </ScrollView>
    </SafeAreaView>
  );
}
