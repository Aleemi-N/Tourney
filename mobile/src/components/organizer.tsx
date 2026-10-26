import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { PortalShell } from '@/components/shell';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { radius, useTheme } from '@/theme';

const TABS = [
  { key: 'index', label: 'Overview', path: '/organizer/[id]' },
  { key: 'participants', label: 'Players', path: '/organizer/[id]/participants' },
  { key: 'fixtures', label: 'Fixtures', path: '/organizer/[id]/fixtures' },
  { key: 'settings', label: 'Settings', path: '/organizer/[id]/settings' },
] as const;

export type OrganizerTab = (typeof TABS)[number]['key'];

/** The tournament name for the page header. */
export function useTournamentName(id: string) {
  const [name, setName] = useState('');
  useEffect(() => {
    api.from('tournaments').select('name').eq('id', id).maybeSingle().then(({ data }) => setName((data?.name as string | undefined) ?? ''));
  }, [id]);
  return name;
}

/** Shared frame of the organizer screens: back link, title, and the Overview / Players / Fixtures / Settings tabs. */
export function OrganizerFrame({ id, current, title, subtitle, children }: { id: string; current: OrganizerTab; title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <PortalShell role="Organizer" home={false}>
      <Pressable accessibilityRole="link" onPress={() => router.replace('/organizer')} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>← Back to Dashboard</Text>
      </Pressable>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.textMuted, fontSize: 14 }}>{subtitle}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 4, borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
        {TABS.map((tab) => {
          const selected = tab.key === current;
          return (
            <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={`Go to ${tab.label}`} accessibilityState={{ selected }}
              onPress={() => !selected && router.replace({ pathname: tab.path, params: { id } })}
              style={{ paddingHorizontal: 16, minHeight: 44, borderRadius: radius.xl, justifyContent: 'center', backgroundColor: selected ? t.primary : 'transparent' }}>
              <Text style={{ color: selected ? t.primaryText : t.textSecondary, fontSize: 14, fontWeight: '700' }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {children}
    </PortalShell>
  );
}
