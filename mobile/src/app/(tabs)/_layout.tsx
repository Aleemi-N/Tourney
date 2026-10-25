import { Tabs } from 'expo-router';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text,
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border }, tabBarActiveTintColor: t.primary, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 13, fontWeight: '600' }, tabBarIconStyle: { display: 'none' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Tournaments' }} />
      <Tabs.Screen name="matches" options={{ title: 'My matches' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
