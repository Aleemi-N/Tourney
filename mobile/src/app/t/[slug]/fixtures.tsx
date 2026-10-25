import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { FixtureCard, useFixtures } from '@/components/fixtures';
import { Empty, Loading, PageTitle, TournamentFrame, useTournament } from '@/components/tournament';
import { useTheme } from '@/theme';

export default function FixturesScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { tournament, teams } = useTournament(slug);
  const fixtures = useFixtures(tournament?.id);
  const byId = Object.fromEntries(teams.map((x) => [x.id, x]));
  const upcoming = (fixtures ?? []).filter((f) => f.status !== 'COMPLETED');
  const rounds = [...new Set(upcoming.map((f) => f.round_number ?? 1))].sort((a, b) => a - b);
  const t = useTheme();
  return (
    <TournamentFrame slug={slug} active="fixtures">
      <PageTitle eyebrow="Schedule" title="Fixtures" />
      {fixtures === null ? <Loading /> : null}
      {fixtures && upcoming.length === 0 ? <Empty text="No upcoming fixtures." /> : null}
      {rounds.map((round) => (
        <View key={round} style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700', marginTop: 8 }}>Round {round}</Text>
          {upcoming.filter((f) => (f.round_number ?? 1) === round).map((f) => <FixtureCard key={f.id} fixture={f} teams={byId} />)}
        </View>
      ))}
    </TournamentFrame>
  );
}
