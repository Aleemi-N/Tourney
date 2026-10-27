import { CalendarClock, House, Trophy, UserRound } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { useT } from '@/lib/i18n';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  const tr = useT();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: 'Geist_600SemiBold', fontSize: 17 },
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border }, tabBarActiveTintColor: t.primary, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 12, lineHeight: 18, paddingBottom: 2, fontFamily: 'Geist_600SemiBold' }, // tall Indic glyphs need the line height
    }}>
      <Tabs.Screen name="index" options={{ title: tr('Home'), headerShown: false, tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="tournaments" options={{ title: tr('Tournaments'), tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} /> }} />
      <Tabs.Screen name="matches" options={{ title: tr('My matches'), headerShown: false, tabBarIcon: ({ color, size }) => <CalendarClock color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: tr('Account'), headerShown: false, tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
