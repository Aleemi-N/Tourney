import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold, useFonts } from '@expo-google-fonts/geist';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth';
import { ThemeChoiceProvider } from '@/lib/theme-choice';
import { useIsDark, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync();

function Navigation() {
  const t = useTheme();
  const dark = useIsDark();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: t.background, card: t.surface, text: t.text, border: t.border, primary: t.primary } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: t.surface }, headerTintColor: t.text, headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Geist_600SemiBold', fontSize: 17 }, contentStyle: { backgroundColor: t.background },
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="register" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="t/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="match/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="scorer/[id]" options={{ title: 'Scoring' }} />
        <Stack.Screen name="organizer/index" options={{ headerShown: false }} />
        <Stack.Screen name="organizer/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="register/player/[slug]" options={{ title: 'Player registration' }} />
        <Stack.Screen name="register/team/[slug]" options={{ title: 'Team application' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({ Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, Geist_800ExtraBold });
  useEffect(() => { if (loaded) void SplashScreen.hideAsync(); }, [loaded]);
  if (!loaded) return null;
  return (
    <ThemeChoiceProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </ThemeChoiceProvider>
  );
}
