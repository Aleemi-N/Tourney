import { router, type Href } from 'expo-router';
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { PortalShell } from '@/components/shell';
import { Text } from '@/components/text';
import { radius, useTheme } from '@/theme';

export type FrameTabDef = { key: string; label: string; href: Href };

/** A portal page with a back link, a title and a row of tabs, shared by the organizer and owner portals. */
export function TabFrame({ role, backLabel, backHref, title, subtitle, tabs, current, children }: {
  role: string; backLabel: string; backHref: Href; title: string; subtitle?: string; tabs: FrameTabDef[]; current: string; children: ReactNode;
}) {
  const t = useTheme();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const xs = useRef<Record<string, number>>({});
  // Bring the current tab into view when the row is wider than the screen.
  const reveal = () => { const x = xs.current[current]; if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - 40), animated: false }); };
  return (
    <PortalShell role={role} home={false}>
      <Pressable accessibilityRole="link" onPress={() => router.replace(backHref)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>← {backLabel}</Text>
      </Pressable>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>{title}</Text>
        {subtitle ? <Text style={{ color: t.textMuted, fontSize: 14 }}>{subtitle}</Text> : null}
      </View>
      <ScrollView ref={scroll} onContentSizeChange={reveal} horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" style={{ flexGrow: 0 }} contentContainerStyle={{ padding: 4, borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }}>
        {tabs.map((tab) => {
          const selected = tab.key === current;
          return (
            <Pressable key={tab.key} onLayout={(e) => { xs.current[tab.key] = e.nativeEvent.layout.x; if (selected) reveal(); }} accessibilityRole="tab" accessibilityLabel={`Go to ${tab.label}`} accessibilityState={{ selected }} onPress={() => !selected && router.replace(tab.href)}
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
