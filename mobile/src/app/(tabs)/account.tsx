import { Link, router } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice } from '@/components/form';
import { PaymentReceipts, PaymentsDue } from '@/components/payments';
import { usePush } from '@/lib/push';
import { useIsSuperAdmin } from '@/components/admin';
import { useOwnerTeams } from '@/components/owner';
import { LANGUAGES, useLanguage } from '@/lib/i18n';
import { PortalIntro, PortalShell, Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PUSH_KEY } from '@/lib/push-token';
import { api, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrganizerTournaments } from '@/lib/organizer';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { radius, ThemeChoiceContext, useTheme } from '@/theme';

type Registration = { id: string; status: string; auction_category: string | null; tournaments: { name: string; slug: string; format: string | null } | null };
type Assignment = { id: string; acquisition_type: string | null; teams: { name: string } | null };
type Application = { id: string; status: string; proposed_team_name: string; tournaments: { name: string } | null };

const ROUTE_LABEL: Record<string, string> = { MAIN_AUCTION: 'Main auction', ICON_LOT: 'Icon lot', SETTER_LOT: 'Setter lot' };
const ACQUISITION: Record<string, string> = { AUCTION: 'Auction', ICON_LOT: 'Icon lot', SETTER_LOT: 'Setter lot', MANUAL: 'Manual', MANUAL_ASSIGNMENT: 'Manual', REGISTERED: 'Registered' };

/** The player portal: the signed-in user's registrations, team assignments and applications. */
export default function AccountScreen() {
  const { session, ready } = useAuth();
  const t = useTheme();
  const themeChoice = useContext(ThemeChoiceContext);
  const setThemeChoice = useSetThemeChoice();
  const { teams: ownedTeams } = useOwnerTeams();
  const superAdmin = useIsSuperAdmin();
  const push = usePush();
  const { tournaments: organized } = useOrganizerTournaments(session?.user.id);
  const [name, setName] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!session) { setLoaded(false); return; }
    (async () => {
      const [profile, player, apps] = await Promise.all([
        api.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle(),
        api.from('player_profiles').select('id,display_name').eq('user_id', session.user.id).maybeSingle(),
        api.from('team_owner_applications').select('id,status,proposed_team_name,tournaments(name)').eq('user_id', session.user.id),
      ]);
      setName(((player.data?.display_name ?? profile.data?.full_name) as string | undefined) ?? null);
      setApplications((apps.data as unknown as Application[]) ?? []);
      if (player.data) {
        const [regs, teams] = await Promise.all([
          api.from('player_tournament_registrations').select('id,status,auction_category,tournaments(name,slug,format)').eq('player_id', player.data.id as string),
          api.from('team_players').select('id,acquisition_type,teams(name)').eq('player_id', player.data.id as string).eq('status', 'ACTIVE'),
        ]);
        setRegistrations((regs.data as unknown as Registration[]) ?? []);
        setAssignments((teams.data as unknown as Assignment[]) ?? []);
      }
      setLoaded(true);
    })();
  }, [session]);

  if (!ready) return <PortalShell role="Player"><Loading /></PortalShell>;
  if (!session) {
    return (
      <PortalShell role="Player" signOut={false}>
        <PortalIntro eyebrow="Player portal" title="Welcome to Tourny." text="Sign in to see your registrations, tournament status and team assignment." />
        <Link href="/login" asChild><Button title="Sign In" onPress={() => {}} /></Link>
        <Link href="/register" asChild><Button tone="secondary" title="Create Account" onPress={() => {}} /></Link>
        <Appearance value={themeChoice} onChange={setThemeChoice} />
        <LanguageChoice />
      </PortalShell>
    );
  }

  const first = (name ?? session.user.email ?? '').split(' ')[0];
  return (
    <PortalShell role="Player">
      <PortalIntro eyebrow="Player portal" title={`Welcome, ${name ?? first}.`} text="Your registrations, tournament status, and team assignment stay authoritative on the server." />
      {!loaded ? <Loading /> : null}

      {superAdmin ? (
        <Section title="Platform">
          <View style={portalCard(t)}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Approve tournaments, manage organizers and review the audit log.</Text>
            <Link href="/admin" asChild><Button title="Open super admin" onPress={() => {}} /></Link>
          </View>
        </Section>
      ) : null}

      {organized && organized.length === 0 ? (
        <Section title="Organizer">
          <View style={portalCard(t)}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Run your own tournament: registration, fixtures, scoring and standings.</Text>
            <Link href="/organizer/new" asChild><Button title="Create a tournament" onPress={() => {}} /></Link>
          </View>
        </Section>
      ) : null}

      {organized && organized.length > 0 ? (
        <Section title="Organizer">
          <View style={portalCard(t)}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>You organize {organized.length} tournament{organized.length === 1 ? '' : 's'}.</Text>
            <Link href="/organizer" asChild><Button title="Review registrations" onPress={() => {}} /></Link>
          </View>
        </Section>
      ) : null}

      {ownedTeams && ownedTeams.length > 0 ? (
        <Section title="Team owner">
          <View style={portalCard(t)}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>You own {ownedTeams.length} team{ownedTeams.length === 1 ? "" : "s"}.</Text>
            <Link href="/owner" asChild><Button title="Open owner portal" onPress={() => {}} /></Link>
          </View>
        </Section>
      ) : null}

      <PaymentsDue />
      <PaymentReceipts />

      {loaded ? (
        <Section title="My tournaments">
          {registrations.length === 0 && applications.length === 0 ? (
            <View style={portalCard(t)}><Text style={{ color: t.textSecondary }}>You have not registered for a tournament yet. Open a tournament that is accepting registrations.</Text></View>
          ) : null}
          {registrations.map((r) => (
            <Pressable key={r.id} accessibilityRole="link" accessibilityLabel={r.tournaments?.name ?? 'Tournament'} onPress={() => r.tournaments && router.push({ pathname: '/t/[slug]', params: { slug: r.tournaments.slug } })} style={portalCard(t)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 20, lineHeight: 26, fontWeight: '800' }}>{r.tournaments?.name}</Text>
                <StatusPill status={r.status} />
              </View>
              <Text style={{ color: t.textMuted, fontSize: 14 }}>{[r.tournaments?.format ? r.tournaments.format[0] + r.tournaments.format.slice(1).toLowerCase() : null, 'Registered team'].filter(Boolean).join(' · ')}</Text>
              {r.auction_category ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{ROUTE_LABEL[r.auction_category] ?? r.auction_category}</Text> : null}
            </Pressable>
          ))}
          {applications.map((a) => (
            <View key={a.id} style={portalCard(t)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 20, lineHeight: 26, fontWeight: '800' }}>{a.proposed_team_name}</Text>
                <StatusPill status={a.status} />
              </View>
              <Text style={{ color: t.textMuted, fontSize: 14 }}>Team application · {a.tournaments?.name}</Text>
            </View>
          ))}
        </Section>
      ) : null}

      {assignments.length > 0 ? (
        <Section title="Team assignment">
          <View style={[portalCard(t), { gap: 4 }]}>
            {assignments.map((a) => (
              <Text key={a.id} style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{a.teams?.name} <Text style={{ color: t.textSecondary, fontWeight: '500' }}>· {ACQUISITION[a.acquisition_type ?? ''] ?? a.acquisition_type ?? 'Registered'}</Text></Text>
            ))}
          </View>
        </Section>
      ) : null}

      {push.supported ? (
        <Section title="Notifications">
          <View style={portalCard(t)}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Get told when your match starts, when a player goes on the auction block, when you are outbid, and when it is your turn in a lot draw.</Text>
            {push.error ? <ErrorText>{push.error}</ErrorText> : null}
            {push.enabled ? <Button tone="secondary" title="Turn off notifications" loading={push.busy} onPress={() => void push.disable()} /> : <Button title="Turn on notifications" loading={push.busy} onPress={() => void push.enable()} />}
          </View>
        </Section>
      ) : null}

      {push.supported && push.enabled ? <Following /> : null}

      <Section title="Account">
        <View style={portalCard(t)}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{name ?? session.user.email}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>{session.user.email}</Text>
        </View>
        {name ? <Link href="/profile" asChild><Button tone="secondary" title="Edit player profile" onPress={() => {}} /></Link> : null}
        <Appearance value={themeChoice} onChange={setThemeChoice} />
        <LanguageChoice />
      </Section>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>Connected to {apiUrl}</Text>
    </PortalShell>
  );
}

/** What this device follows, with a way to stop. */
function Following() {
  const t = useTheme();
  const [items, setItems] = useState<{ kind: string; target_id: string; name: string | null }[] | null>(null);
  const load = async () => {
    const token = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
    if (!token) return setItems([]);
    const { data } = await api.rpc('get_push_follows', { p_token: token });
    setItems((data ?? []) as { kind: string; target_id: string; name: string | null }[]);
  };
  useEffect(() => { void load(); }, []);
  return (
    <Section title="Following">
      <View style={portalCard(t)}>
        {items === null ? <Loading /> : items.length === 0 ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>You are not following anything yet. Open a team, match or tournament and tap Follow.</Text> : items.map((f) => (
          <View key={`${f.kind}${f.target_id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{f.name ?? 'Removed'}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12, textTransform: 'capitalize' }}>{f.kind.toLowerCase()}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Unfollow ${f.name}`} onPress={async () => { const token = await AsyncStorage.getItem(PUSH_KEY); if (token) await api.rpc('unfollow_target', { p_token: token, p_kind: f.kind, p_target_id: f.target_id }); await load(); }} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
              <Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>Unfollow</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </Section>
  );
}

/** Which language the app speaks. Text without a translation stays English. */
function LanguageChoice() {
  const t = useTheme();
  const { lang, setLang } = useLanguage();
  return (
    <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
      <Choice label="Language" value={lang} options={LANGUAGES} onChange={setLang} />
    </View>
  );
}

function Appearance({ value, onChange }: { value: 'system' | 'light' | 'dark'; onChange: (v: 'system' | 'light' | 'dark') => void }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
      <Choice label="Appearance" value={value} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={onChange} />
    </View>
  );
}
