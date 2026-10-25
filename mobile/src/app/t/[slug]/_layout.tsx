import { Stack } from 'expo-router';

// Every tournament screen draws its own header (brand tile, status, theme toggle and section tabs).
export default function TournamentLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
