import { CalendarClock, House, Trophy, UserRound } from 'lucide-react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: 'Geist_600SemiBold', fontSize: 17 },
      tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border }, tabBarActiveTintColor: t.primary, tabBarInactiveTintColor: t.textMuted,
      tabBarLabelStyle: { fontSize: 12, fontFamily: 'Geist_600SemiBold' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="tournaments" options={{ title: 'Tournaments', tabBarIcon: ({ color, size }) => <Trophy color={color} size={size} /> }} />
      <Tabs.Screen name="matches" options={{ title: 'My matches', tabBarIcon: ({ color, size }) => <CalendarClock color={color} size={size} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
