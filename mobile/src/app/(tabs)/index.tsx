import { Link, router } from 'expo-router';
import { ArrowRight, Building2, Calendar, ChartColumn, ClipboardList, MapPin, Moon, Play, Sun, Trophy, User, Users, Volleyball } from 'lucide-react-native';
import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { Button, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { radius, ThemeChoiceContext, tint, useIsDark, useTheme } from '@/theme';

type Tournament = { id: string; name: string; slug: string; status: string; venue: string | null; start_date: string | null; format: string | null };

const STEPS = [
  { icon: Trophy, title: 'Create Tournament', text: 'Set format, rules, and branding' },
  { icon: Users, title: 'Register Teams & Players', text: 'Reusable profiles, team applications' },
  { icon: ClipboardList, title: 'Manage Competition', text: 'Lot draw, auction, squad building' },
  { icon: Play, title: 'Go Live', text: 'Fixtures, live scoring, real-time updates' },
  { icon: ChartColumn, title: 'Results & Standings', text: 'Automatic standings, match history' },
];

const ROLES = [
  { icon: Building2, title: 'Organizer', points: ['Create tournaments', 'Manage participants', 'Control operations'] },
  { icon: Users, title: 'Team Owner', points: ['Register team', 'Manage roster', 'Auction & squad'] },
  { icon: User, title: 'Player', points: ['Reusable profile', 'Tournament registration', 'Track status'] },
  { icon: Play, title: 'Spectator', points: ['Live scores', 'Fixtures', 'Standings'] },
];

/** The app's first page: the same landing as the website, in the same order. */
export default function HomeScreen() {
  const t = useTheme();
  const dark = useIsDark();
  const { session } = useAuth();
  const choice = useContext(ThemeChoiceContext);
  const setChoice = useSetThemeChoice();
  const [items, setItems] = useState<Tournament[] | null>(null);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,slug,status,venue,start_date,format').order('start_date', { ascending: false }).limit(6)
      .then(({ data }) => setItems((data as Tournament[]) ?? []));
  }, []);

  const createTournament = () => router.push(session ? '/organizer' : '/login');
  const findTournament = () => router.push('/tournaments');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      {/* Top bar: logo, theme toggle, account */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Volleyball size={24} color={t.primary} />
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Tourny</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onPress={() => setChoice(dark ? 'light' : 'dark')}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} hitSlop={4}>
            {dark ? <Sun size={20} color={t.textSecondary} /> : <Moon size={20} color={t.textSecondary} />}
          </Pressable>
          {!session ? <Link href="/login" asChild><Pressable accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>Sign In</Text></Pressable></Link> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 20 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center' }}>
            Run Your{'\n'}Tournament.{'\n'}<Text style={{ color: t.primary, fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.2 }}>Own Every{'\n'}Moment.</Text>
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
            Create and manage volleyball tournaments — registrations, teams, players, lot draw, auction, live scoring and standings — from one platform.
          </Text>
          <View style={{ gap: 12 }}>
            <Button title="Create Tournament" onPress={createTournament} />
            <Button tone="secondary" title="Find Tournament" onPress={findTournament} />
          </View>
          <HeroCards />
        </View>

        {/* Live & upcoming tournaments */}
        <View style={{ paddingTop: 40, gap: 8 }}>
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 }}>Live & Upcoming Tournaments</Text>
            <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24 }}>Find your next competition or spectate live action.</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }} snapToInterval={292} decelerationRate="fast">
            {(items ?? []).map((item) => <TournamentCard key={item.id} item={item} />)}
            {items?.length === 0 ? <Text style={{ color: t.textSecondary }}>No public tournaments yet.</Text> : null}
          </ScrollView>
        </View>

        {/* How it works */}
        <View style={{ paddingHorizontal: 16, paddingTop: 32, gap: 8 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' }}>Everything in one place.</Text>
          <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 12 }}>From creation to final whistle — managed end to end.</Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 }}>
              <View style={{ width: 80, height: 80, borderRadius: radius['2xl'], backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                <step.icon size={32} color={t.primary} />
                <View style={{ position: 'absolute', top: -6, right: -6, minWidth: 28, height: 28, borderRadius: 14, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700' }}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{step.title}</Text>
                <Text style={{ color: t.textSecondary, fontSize: 14, lineHeight: 20 }}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Roles */}
        <View style={{ paddingHorizontal: 16, paddingTop: 32, gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' }}>One platform. Every perspective.</Text>
          {ROLES.map((role) => (
            <View key={role.title} style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius['2xl'], padding: 20, gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: radius.xl, backgroundColor: tint(t.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                <role.icon size={22} color={t.primary} />
              </View>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{role.title}</Text>
              {role.points.map((p) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary }} />
                  <Text style={{ color: t.textSecondary, fontSize: 15 }}>{p}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Closing call to action */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 16 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' }}>Ready to run your next tournament?</Text>
          <Button title="Create Tournament" onPress={createTournament} />
          <Button tone="secondary" title="Explore Tournaments" onPress={findTournament} />
          <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>© 2026 Tournament Platform</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TournamentCard({ item }: { item: Tournament }) {
  const t = useTheme();
  const initials = item.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const date = item.start_date ? new Date(item.start_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null;
  return (
    <Link href={{ pathname: '/t/[slug]', params: { slug: item.slug } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`${item.name}, ${item.status}`} style={{ width: 280, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius['3xl'], padding: 20, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ width: 56, height: 56, borderRadius: radius['2xl'], backgroundColor: t.surfaceMuted, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.textSecondary, fontSize: 16, fontWeight: '700' }}>{initials}</Text>
          </View>
          <StatusPill status={item.status} />
        </View>
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 19, fontWeight: '700' }}>{item.name}</Text>
        <View style={{ gap: 6 }}>
          {item.venue ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><MapPin size={16} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 14 }}>{item.venue}</Text></View> : null}
          {date ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Calendar size={16} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 14 }}>{date}</Text></View> : null}
        </View>
        {item.format ? <View style={{ flexDirection: 'row' }}><Chip>{item.format[0] + item.format.slice(1).toLowerCase()}</Chip></View> : null}
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>View Tournament</Text>
          <ArrowRight size={16} color={t.primary} />
        </View>
      </Pressable>
    </Link>
  );
}

function Chip({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.surfaceMuted, borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '600' }}>{children}</Text></View>;
}

/** The hero's overlapping tournament, player and live-score cards. */
function HeroCards() {
  const t = useTheme();
  const card = { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius['2xl'], padding: 14, shadowColor: t.shadow, shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 } as const;
  return (
    <View style={{ height: 330, marginTop: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[card, { position: 'absolute', left: 0, top: 6, width: 220, transform: [{ rotate: '-6deg' }] }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ width: 36, height: 36, borderRadius: radius.xl, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.primaryText, fontWeight: '700' }}>VC</Text></View>
          <StatusPill status="LIVE" />
        </View>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '800', marginTop: 10 }}>VOLLEYBALL CHAMPIONSHIP</Text>
        <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 2 }}>VENUE · DATE</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}><Chip>LEAGUE</Chip><Chip>AUCTION</Chip></View>
      </View>
      <View style={[card, { position: 'absolute', right: 6, top: 60, width: 190, transform: [{ rotate: '4deg' }], height: 220 }]}>
        <View style={{ alignSelf: 'flex-end', backgroundColor: t.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}><Text style={{ color: t.primaryText, fontSize: 11, fontWeight: '700' }}>ICON</Text></View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><User size={64} color={t.textMuted} /></View>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>PLAYER</Text>
        <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Chip>OUTSIDE HITTER</Chip></View>
        <Text style={{ color: t.textMuted, fontSize: 11, marginTop: 6 }}>188 CM · LOCATION</Text>
      </View>
      <View style={[card, { position: 'absolute', left: 30, bottom: 0, width: 230, transform: [{ rotate: '-2deg' }] }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
          <Text style={{ color: t.textSecondary, fontSize: 11, fontWeight: '700' }}>SET 2</Text>
          <StatusPill tone="live" label="In progress" />
        </View>
        {[['TEAM ALPHA', 24, true], ['TEAM BETA', 18, false]].map(([name, score, lead]) => (
          <View key={String(name)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
            <Text style={{ color: lead ? t.text : t.textSecondary, fontSize: 14, fontWeight: '700' }}>{String(name)}</Text>
            <Text style={{ color: lead ? t.text : t.textSecondary, fontSize: 18, fontWeight: '800' }}>{String(score)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
