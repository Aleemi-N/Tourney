import { useLocalSearchParams } from 'expo-router';
import { Empty, Loading, PageTitle, TournamentFrame, useTournament } from '@/components/tournament';
import { View } from 'react-native';
import { FixtureCard, useFixtures } from '@/components/fixtures';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** What is happening now: matches in play, then the next ones. */
export default function LiveScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams } = useTournament(slug);
  const fixtures = useFixtures(tournament?.id);
  const byId = Object.fromEntries(teams.map((x) => [x.id, x]));
  const live = (fixtures ?? []).filter((f) => f.status === 'LIVE');
  const next = (fixtures ?? []).filter((f) => f.status === 'SCHEDULED').slice(0, 3);
  return (
    <TournamentFrame slug={slug} active="live">
      <PageTitle eyebrow="Right now" title="Live" />
      {fixtures === null ? <Loading /> : null}
      {fixtures && live.length === 0 ? <Empty text="No match is being played right now." /> : null}
      {live.map((f) => <FixtureCard key={f.id} fixture={f} teams={byId} />)}
      {next.length > 0 ? (
        <View style={{ gap: 12 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700', marginTop: 8 }}>Up next</Text>
          {next.map((f) => <FixtureCard key={f.id} fixture={f} teams={byId} />)}
        </View>
      ) : null}
    </TournamentFrame>
  );
}
