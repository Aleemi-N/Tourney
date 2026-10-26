import { router } from 'expo-router';
import { Home, LogOut, Moon, Sun, Volleyball } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { useAuth } from '@/lib/auth';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { radius, useIsDark, useTheme } from '@/theme';

/** A signed-in portal page (Player, Scorer, Organizer): top bar with role label, theme toggle and sign out. */
export function PortalShell({ role, children, home = true, signOut = true }: { role: string; children: ReactNode; home?: boolean; signOut?: boolean }) {
  const t = useTheme();
  const dark = useIsDark();
  const setChoice = useSetThemeChoice();
  const auth = useAuth();
  const icon = (label: string, onPress: () => void, node: ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{node}</Pressable>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 60, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {home ? icon('Home', () => router.navigate('/'), <Home size={20} color={t.textSecondary} />) : null}
          <Volleyball size={22} color={t.primary} />
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Tourny</Text>
          <Text style={{ color: t.textMuted, fontSize: 14 }}>{role}</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {icon(dark ? 'Switch to light theme' : 'Switch to dark theme', () => setChoice(dark ? 'light' : 'dark'), dark ? <Sun size={20} color={t.textSecondary} /> : <Moon size={20} color={t.textSecondary} />)}
          {signOut && auth.session ? icon('Sign out', () => void auth.signOut(), <LogOut size={20} color={t.textSecondary} />) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </SafeAreaView>
  );
}

/** Small uppercase section label with a heading, as on the web portals. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' }}>{title}</Text>
      {children}
    </View>
  );
}

export function PortalIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' }}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.9 }}>{title}</Text>
      {text ? <Text style={{ color: t.textSecondary, fontSize: 16, lineHeight: 24 }}>{text}</Text> : null}
    </View>
  );
}

export const portalCard = (t: ReturnType<typeof useTheme>) => ({ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 20, gap: 8 }) as const;
