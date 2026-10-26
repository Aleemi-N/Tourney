import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { FixturesPoster, PosterShare, useLogoUrl } from '@/components/poster';
import { Text } from '@/components/text';
import { FixtureCard, useFixtures } from '@/components/fixtures';
import { Empty, Loading, PageTitle, TournamentFrame, useTournament } from '@/components/tournament';
import { useTheme } from '@/theme';

export default function FixturesScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { tournament, teams } = useTournament(slug);
  const fixtures = useFixtures(tournament?.id);
  const logo = useLogoUrl(tournament?.id);
  const byId = Object.fromEntries(teams.map((x) => [x.id, x]));
  const upcoming = (fixtures ?? []).filter((f) => f.status !== 'COMPLETED');
  const rounds = [...new Set(upcoming.map((f) => f.round_number ?? 1))].sort((a, b) => a - b);
  const t = useTheme();
  return (
    <TournamentFrame slug={slug} active="fixtures">
      <PageTitle eyebrow="Schedule" title="Fixtures" />
      {tournament && upcoming.length > 0 ? (
        <PosterShare label="Share fixtures poster" fileName="fixtures.png" shareTitle={`${tournament.name} fixtures`}>
          <FixturesPoster tournament={tournament} logoUrl={logo} matches={upcoming.slice(0, 8).map((f) => ({ id: f.id, label: `ROUND ${f.round_number ?? 1} · MATCH ${f.match_number ?? '—'}`, home: byId[f.home_team_id ?? '']?.name ?? 'TBD', away: byId[f.away_team_id ?? '']?.name ?? 'TBD', when: f.scheduled_at ? new Date(f.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null, court: f.court }))} />
        </PosterShare>
      ) : null}
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
