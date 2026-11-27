import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import { ArrowRight, Award, Bell, Calendar, CalendarDays, ClipboardCheck, ClipboardList, Eye, Gavel, ListOrdered, MapPin, Moon, Play, Shield, Shirt, Shuffle, Star, Sun, Trophy, Users, Volleyball, Zap } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { Button, StatusPill } from '@/components/ui';
import { CountUp, CourtScene, FadeIn, LiveScoreboard, Marquee } from '@/components/home-motion';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { palettes, radius, tint, useIsDark, useTheme } from '@/theme';

type Tournament = { id: string; name: string; slug: string; status: string; venue: string | null; start_date: string | null; format: string | null };

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=1200&q=70&auto=format`;
// Free photos under the Unsplash License, the same ones as the website's landing page.
const PHOTOS = {
  hero: photo('1758119354171-f14f082c5e02'),
  sunset: photo('1612872087720-bb876e2e67d1'),
  shots: [
    { src: photo('1728971124745-423b12df446d'), kicker: 'EVERY RALLY', line: 'Scored live, point by point.', alt: 'A player jumps to spike during an indoor match' },
    { src: photo('1547347298-4074fc3086f0'), kicker: 'EVERY BID', line: 'Auctions everyone can watch.', alt: 'An indoor women’s volleyball match at the net' },
    { src: photo('1567781830902-685fb3401f1d'), kicker: 'EVERY PLAYER', line: 'One profile, every season.', alt: 'Players ready to dig a serve in a dark arena' },
  ],
};

const STEPS = [
  { icon: Trophy, title: 'Create', text: 'Set the format, rules, fees and your tournament’s look.' },
  { icon: ClipboardList, title: 'Register', text: 'Teams and players sign up online; you approve them.' },
  { icon: Gavel, title: 'Build squads', text: 'Run the lot draw and live auction, or use registered teams.' },
  { icon: Play, title: 'Play live', text: 'Fixtures, live scoring, standings and certificates follow.' },
];

const FEATURES = [
  { icon: Zap, title: 'Live scoring' }, { icon: Gavel, title: 'Player auctions' }, { icon: Shuffle, title: 'Digital lot draw' },
  { icon: CalendarDays, title: 'Fixtures' }, { icon: ListOrdered, title: 'Standings' }, { icon: Award, title: 'Certificates' },
  { icon: Shirt, title: 'Jersey export' }, { icon: Bell, title: 'Notifications' }, { icon: Trophy, title: 'Tournament management' },
  { icon: ClipboardList, title: 'Team & player registration' },
];

const ROLES = [
  { icon: Shield, title: 'Organizer', points: ['Create and run tournaments', 'Approve teams and players', 'Lot draw, auction, fixtures'] },
  { icon: Users, title: 'Team owner', points: ['Register your team', 'Bid in the live auction', 'Manage your squad'] },
  { icon: Star, title: 'Player', points: ['One profile, every season', 'Register in a few taps', 'Certificates and history'] },
  { icon: ClipboardCheck, title: 'Scorer', points: ['Score rally by rally', 'Works on any phone', 'Fix mistakes safely'] },
  { icon: Eye, title: 'Fan', points: ['Live scores and sets', 'Fixtures and standings', 'Follow from anywhere'] },
];

// Live, registration-open and upcoming only, like the website; finished tournaments are on the Tournaments tab.
const OPEN_STATUSES = ['LIVE', 'REGISTRATION', 'PREPARATION'];

/** The app's first page: the same landing as the website, in the same order. */
export default function HomeScreen() {
  const t = useTheme();
  const dark = useIsDark();
  const { session } = useAuth();
  const setChoice = useSetThemeChoice();
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [stats, setStats] = useState<{ label: string; value: number }[]>([]);

  useEffect(() => {
    api.from('public_tournament_view').select('id,name,slug,status,venue,start_date,format').in('status', OPEN_STATUSES).order('start_date', { ascending: false }).limit(6)
      .then(({ data }) => setItems((data as Tournament[]) ?? []));
    const head = { count: 'exact' as const, head: true };
    Promise.all([
      api.from('tournaments').select('id', head).eq('is_public', true),
      api.from('teams').select('id', head),
      api.from('player_profiles').select('id', head),
    ]).then(([a, b, c]) => setStats([
      { label: 'TOURNAMENTS', value: a.count ?? 0 }, { label: 'TEAMS', value: b.count ?? 0 }, { label: 'PLAYERS', value: c.count ?? 0 },
    ].filter((s) => s.value > 0)));
  }, []);

  const createTournament = () => router.push(session ? '/organizer' : '/login');
  const findTournament = () => router.push('/tournaments');
  const eyebrow = (label: string) => <Text style={{ color: t.primary, fontSize: 13, fontWeight: '700', letterSpacing: 2 }}>{label}</Text>;
  const h2 = { color: t.text, fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8 } as const;
  const card = { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius['3xl'] } as const;
  const fill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

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
        {/* Hero: faded action photo behind the headline */}
        <View style={{ overflow: 'hidden' }}>
          <Image source={PHOTOS.hero} accessible={false} contentFit="cover" style={[fill, { opacity: dark ? 0.3 : 0.18 }]} />
          <View style={[fill, { backgroundColor: tint(t.background, 0.55) }]} />
          <View style={{ paddingHorizontal: 16, paddingTop: 36, gap: 20 }}>
            <FadeIn style={{ alignSelf: 'center' }}>
              <View style={{ borderWidth: 1, borderColor: tint(t.primary, 0.3), backgroundColor: tint(t.primary, 0.1), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textAlign: 'center' }}>VOLLEYBALL TOURNAMENTS, START TO FINISH</Text>
              </View>
            </FadeIn>
            <FadeIn delay={100}>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2, textAlign: 'center' }}>
                Run the tournament.{'\n'}<Text style={{ color: t.primary, fontSize: 38, lineHeight: 42, fontWeight: '800', letterSpacing: -1.2 }}>Own every point.</Text>
              </Text>
            </FadeIn>
            <FadeIn delay={200}>
              <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>
                Registrations, live player auctions, lot draw, fixtures, point-by-point scoring and standings — one app for organizers, teams, players, scorers and fans.
              </Text>
            </FadeIn>
            <FadeIn delay={300} style={{ gap: 12 }}>
              <Button title="Create tournament" onPress={createTournament} />
              <Button tone="secondary" title="Find tournament" onPress={findTournament} />
            </FadeIn>
            {stats.length > 0 ? (
              <FadeIn delay={400} style={[card, { flexDirection: 'row', paddingVertical: 14 }]}>
                {stats.map((s, i) => (
                  <View key={s.label} style={{ flex: 1, alignItems: 'center', gap: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.border }}>
                    <CountUp value={s.value} style={{ color: t.text, fontSize: 28, fontWeight: '800' }} />
                    <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>{s.label}</Text>
                  </View>
                ))}
              </FadeIn>
            ) : null}
            <FadeIn delay={500}><LiveScoreboard /></FadeIn>
            <CourtScene primary={t.primary} text={t.text} surface={t.surface} border={t.borderStrong} success={t.success} muted={t.textMuted} />
          </View>
        </View>

        <View style={{ marginTop: 24 }}><Marquee background={palettes.light.primary} color={palettes.light.primaryText} /></View>

        {/* Game day photos */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 12 }}>
          {eyebrow('BUILT FOR GAME DAY')}
          <Text accessibilityRole="header" style={h2}>You bring the energy. We handle the rest.</Text>
          {PHOTOS.shots.map((s, i) => (
            <View key={s.kicker} style={{ height: i === 0 ? 260 : 200, borderRadius: radius['3xl'], overflow: 'hidden', backgroundColor: palettes.dark.surface }}>
              <Image source={s.src} accessibilityLabel={s.alt} contentFit="cover" transition={400} style={fill} />
              {/* A stepped shade standing in for a gradient, so the caption reads on any photo */}
              {(['80%', '55%', '35%'] as const).map((h) => <View key={h} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, backgroundColor: tint(palettes.dark.background, 0.28) }} />)}
              <View style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
                <Text style={{ color: palettes.dark.primary, fontSize: 12, fontWeight: '700', letterSpacing: 2 }}>{s.kicker}</Text>
                <Text style={{ color: palettes.dark.text, fontSize: i === 0 ? 26 : 21, lineHeight: i === 0 ? 30 : 25, fontWeight: '800' }}>{s.line}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Live & upcoming tournaments */}
        <View style={{ paddingTop: 40, gap: 8 }}>
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            {eyebrow('ON NOW')}
            <Text accessibilityRole="header" style={h2}>Live & upcoming tournaments</Text>
            <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24 }}>Join one that is open for registration, or watch the action live.</Text>
          </View>
          {items?.length === 0 ? (
            <View style={[card, { marginHorizontal: 16, marginTop: 8, padding: 24, alignItems: 'center', gap: 8, borderStyle: 'dashed' }]}>
              <Volleyball size={40} color={t.textMuted} />
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Nothing live or open right now.</Text>
              <Text style={{ color: t.textSecondary, fontSize: 14, textAlign: 'center' }}>See past tournaments, or start the next one.</Text>
              <View style={{ alignSelf: 'stretch', marginTop: 8 }}><Button tone="secondary" title="All tournaments" onPress={findTournament} /></View>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }} snapToInterval={292} decelerationRate="fast">
              {(items ?? []).map((item) => <TournamentCard key={item.id} item={item} />)}
            </ScrollView>
          )}
        </View>

        {/* How it works */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 12 }}>
          {eyebrow('HOW IT WORKS')}
          <Text accessibilityRole="header" style={h2}>From sign-up to final whistle.</Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={[card, { padding: 18, overflow: 'hidden', flexDirection: 'row', gap: 14, alignItems: 'center' }]}>
              <Text style={{ position: 'absolute', right: 10, top: -14, color: tint(t.primary, 0.12), fontSize: 88, fontWeight: '800' }}>{index + 1}</Text>
              <View style={{ width: 44, height: 44, borderRadius: radius.xl, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
                <step.icon size={22} color={t.primaryText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{index + 1}. {step.title}</Text>
                <Text style={{ color: t.textSecondary, fontSize: 14, lineHeight: 20 }}>{step.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Features */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 12 }}>
          {eyebrow('FEATURES')}
          <Text accessibilityRole="header" style={h2}>Everything game day needs.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
            {FEATURES.map((f) => (
              <View key={f.title} style={[card, { width: '48.5%', borderRadius: radius['2xl'], padding: 14, gap: 10 }]}>
                <View style={{ width: 38, height: 38, borderRadius: radius.xl, backgroundColor: tint(t.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                  <f.icon size={19} color={t.primary} />
                </View>
                <Text style={{ color: t.text, fontSize: 14, lineHeight: 19, fontWeight: '700' }}>{f.title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Roles */}
        <View style={{ paddingHorizontal: 16, paddingTop: 40, gap: 12 }}>
          {eyebrow('FOR EVERYONE ON COURT')}
          <Text accessibilityRole="header" style={h2}>One platform. Five roles.</Text>
          {ROLES.map((role) => (
            <View key={role.title} style={[card, { padding: 18, gap: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: radius.xl, backgroundColor: tint(t.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                  <role.icon size={20} color={t.primary} />
                </View>
                <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{role.title}</Text>
              </View>
              {role.points.map((p) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.primary }} />
                  <Text style={{ color: t.textSecondary, fontSize: 15 }}>{p}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* Closing call to action over a sunset photo */}
        <View style={{ marginTop: 40, overflow: 'hidden' }}>
          <Image source={PHOTOS.sunset} accessible={false} contentFit="cover" style={[fill, { opacity: dark ? 0.5 : 0.4 }]} />
          <View style={[fill, { backgroundColor: tint(t.background, 0.6) }]} />
          <View style={{ paddingHorizontal: 16, paddingVertical: 48, gap: 16 }}>
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1, textAlign: 'center' }}>Ready for your next tournament?</Text>
            <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>Set it up in minutes. Your teams, players and fans take it from there.</Text>
            <Button title="Create tournament" onPress={createTournament} />
            <Button tone="secondary" title="Explore tournaments" onPress={findTournament} />
          </View>
        </View>
        <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16 }}>© 2026 Tourny · Built by Appfyniti</Text>
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
