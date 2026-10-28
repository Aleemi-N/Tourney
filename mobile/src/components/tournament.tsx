import { router } from 'expo-router';
import { Moon, Sun } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { Body, Button, Card, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api, imageUrl } from '@/lib/api';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { radius, tint, useIsDark, useTheme, type Palette } from '@/theme';

export type TournamentInfo = {
  id: string; name: string; slug: string; sport: string | null; format: string | null; venue: string | null; description: string | null;
  start_date: string | null; end_date: string | null; status: string; primary_color: string | null;
};
export type TeamInfo = { id: string; name: string; short_name: string | null; place: string | null; primary_color: string | null; secondary_color: string | null };

export type Sponsor = { id: string; name: string; logo_path: string | null; website: string | null; tier: 'TITLE' | 'SPONSOR' | 'PARTNER' };
export type PublicExtras = { stream_url: string | null; sponsors: Sponsor[] };

/** The tournament and its teams, loaded once per screen. `null` means not found. */
export function useTournament(slug: string) {
  const [tournament, setTournament] = useState<TournamentInfo | null | undefined>(undefined);
  const [teams, setTeams] = useState<TeamInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [extras, setExtras] = useState<PublicExtras | null>(null);
  useEffect(() => {
    api.rpc('get_public_extras', { p_slug: slug }).then(({ data }) => setExtras((data as unknown as PublicExtras | null) ?? null));
  }, [slug]);
  useEffect(() => {
    (async () => {
      const { data, error: e } = await api.from('public_tournament_view')
        .select('id,name,slug,sport,format,venue,description,start_date,end_date,status,primary_color').eq('slug', slug).maybeSingle();
      if (e) return setError(e.message);
      setTournament((data as TournamentInfo | null) ?? null);
      if (!data) return;
      const t = await api.from('public_team_view').select('id,name,short_name,place,primary_color,secondary_color').eq('tournament_id', (data as TournamentInfo).id).order('name');
      setTeams((t.data as TeamInfo[]) ?? []);
    })();
  }, [slug]);
  return { tournament, teams, error, extras };
}

export const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const shortOf = (team: { name: string; short_name?: string | null }) => (team.short_name ?? team.name).slice(0, 3).toUpperCase();

/** A rounded tile with a short name: in the team's own colours, or the brand tint. */
export function Tile({ label, color, size = 40 }: { label: string; color?: string | null; size?: number }) {
  const t = useTheme();
  const accent = color ?? t.primary;
  return (
    <View style={{ width: size, height: size, borderRadius: size >= 48 ? radius['2xl'] : radius.xl, backgroundColor: color ? tint(color, 0.14) : tint(t.primary, 0.12), borderWidth: 1, borderColor: color ? tint(color, 0.3) : t.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: accent, fontSize: size >= 48 ? 15 : 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Eyebrow, big title and an optional line under it, like the web's page headers. */
export function PageTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, marginBottom: 8 }}>
      {eyebrow ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.6 }}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>{title}</Text>
      {subtitle ? <Text style={{ color: t.textMuted, fontSize: 14 }}>{subtitle}</Text> : null}
    </View>
  );
}

const TABS = [
  { id: 'live', label: 'Live' }, { id: 'fixtures', label: 'Fixtures' }, { id: 'results', label: 'Results' },
  { id: 'table', label: 'Table' }, { id: 'teams', label: 'Teams' }, { id: 'players', label: 'Players' },
] as const;
export type FrameTab = (typeof TABS)[number]['id'];

/** The public tournament frame: brand tile, name, status, theme toggle and the section tabs. */
export function TournamentFrame({ slug, active, children }: { slug: string; active?: FrameTab; children: ReactNode }) {
  const t = useTheme();
  const dark = useIsDark();
  const setChoice = useSetThemeChoice();
  const { tournament, error, extras } = useTournament(slug);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 60 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={8}>
            <Tile label={tournament ? initials(tournament.name) : '…'} size={36} />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '600' }}>{tournament?.name ?? ''}</Text>
          {tournament ? <View style={{ flexShrink: 0, justifyContent: 'center' }}><StatusPill status={tournament.status} /></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={dark ? 'Switch to light theme' : 'Switch to dark theme'} onPress={() => setChoice(dark ? 'light' : 'dark')} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            {dark ? <Sun size={20} color={t.textSecondary} /> : <Moon size={20} color={t.textSecondary} />}
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }} accessibilityRole="tablist">
          {TABS.map((tab) => {
            const selected = tab.id === active;
            return (
              <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => router.replace({ pathname: `/t/[slug]/${tab.id}`, params: { slug } })}
                style={{ paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: selected ? t.primary : 'transparent' }}>
                <Text style={{ color: selected ? t.primary : t.textSecondary, fontSize: 14, fontWeight: '600' }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {tournament === null ? <Body muted>This tournament is unavailable or no longer public.</Body> : (
          <>
            {extras?.stream_url ? <Button title="Watch live" accessibilityLabel="Watch the live stream" onPress={() => void Linking.openURL(extras.stream_url as string)} /> : null}
            {children}
            <Sponsors sponsors={extras?.sponsors ?? []} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Sponsor logos at the bottom of the public pages; the title sponsor is larger. */
export function Sponsors({ sponsors }: { sponsors: Sponsor[] }) {
  const t = useTheme();
  if (sponsors.length === 0) return null;
  return (
    <View accessibilityLabel="Sponsors" style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: t.border, gap: 12, alignItems: 'center' }}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>Our sponsors</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
        {sponsors.map((s) => {
          const uri = imageUrl('logos', s.logo_path);
          const height = s.tier === 'TITLE' ? 52 : s.tier === 'SPONSOR' ? 38 : 28;
          const inner = uri ? <Image accessibilityLabel={s.name} source={{ uri }} style={{ height, width: height * 3 }} resizeMode="contain" /> : <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '700' }}>{s.name}</Text>;
          return s.website ? <Pressable key={s.id} accessibilityRole="link" accessibilityLabel={s.name} onPress={() => void Linking.openURL(s.website as string)}>{inner}</Pressable> : <View key={s.id}>{inner}</View>;
        })}
      </View>
    </View>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <Card style={{ padding: 0, gap: 0 }}>{children}</Card>;
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: t.borderStrong, borderRadius: radius['2xl'], padding: 24 }}><Text style={{ color: t.textSecondary, textAlign: 'center' }}>{text}</Text></View>;
}

export { Loading };

export const positionLabel = (p: string) => p.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
export const positionTone = (p: string | null, t: Palette) => ({ SETTER: t.warning, LIBERO: t.success, MIDDLE_BLOCKER: t.primary, OUTSIDE_HITTER: t.danger, OPPOSITE: t.info }[p ?? ''] ?? t.textSecondary);
