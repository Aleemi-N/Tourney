import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { PosterShare, StandingsPoster, useLogoUrl } from '@/components/poster';
import { Text } from '@/components/text';
import { Empty, Loading, PageTitle, shortOf, Tile, TournamentFrame, useTournament } from '@/components/tournament';
import { api } from '@/lib/api';
import { radius, useTheme } from '@/theme';

type Row = { stage_id: string; team_id: string; team_name: string; played: number; won: number; lost: number; drawn?: number; league_points: number; sets_won: number; sets_lost: number; points_for: number; points_against: number };

const COLUMNS: { key: string; label: string; width: number }[] = [
  { key: 'played', label: 'P', width: 34 }, { key: 'won', label: 'W', width: 34 }, { key: 'drawn', label: 'D', width: 34 }, { key: 'lost', label: 'L', width: 34 },
  { key: 'league_points', label: 'PTS', width: 48 }, { key: 'sets_won', label: 'SW', width: 38 }, { key: 'sets_lost', label: 'SL', width: 38 },
  { key: 'points_for', label: 'PF', width: 44 }, { key: 'points_against', label: 'PA', width: 44 },
];

export default function TableScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams } = useTournament(slug);
  const logo = useLogoUrl(tournament?.id);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!tournament) return;
    api.rpc('get_public_standings', { p_tournament_id: tournament.id }).then(({ data }) => setRows((data as unknown as Row[]) ?? []));
  }, [tournament]);
  const byId = Object.fromEntries(teams.map((x) => [x.id, x]));
  const header = { color: t.textMuted, fontSize: 12, fontWeight: '700' } as const;

  return (
    <TournamentFrame slug={slug} active="table">
      <PageTitle eyebrow="League table" title="Standings" />
      {tournament && rows && rows.length > 0 ? (
        <PosterShare label="Share standings poster" fileName="standings.png" shareTitle={`${tournament.name} standings`}>
          <StandingsPoster tournament={tournament} logoUrl={logo} stageName="League" rows={rows} />
        </PosterShare>
      ) : null}
      {rows === null ? <Loading /> : null}
      {rows && rows.length === 0 ? <Empty text="The table fills in once matches are played." /> : null}
      {rows && rows.length > 0 ? (
        <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, overflow: 'hidden' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: t.border }}>
                <Text style={[header, { width: 28 }]}>#</Text>
                <Text style={[header, { width: 170 }]}>TEAM</Text>
                {COLUMNS.map((c) => <Text key={c.key} style={[header, { width: c.width, textAlign: 'center' }]}>{c.label}</Text>)}
              </View>
              {rows.map((row, index) => {
                const team = byId[row.team_id];
                const top = index === 0 || index === 2;
                return (
                  <View key={`${row.stage_id}-${row.team_id}`} style={{ flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: t.border }}>
                    <Text style={{ width: 28, color: top ? t.warning : t.textMuted, fontSize: 14, fontWeight: '800' }}>{index + 1}</Text>
                    <View style={{ width: 170, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Tile label={team ? shortOf(team) : row.team_name.slice(0, 2).toUpperCase()} size={34} />
                      <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '700' }}>{row.team_name}</Text>
                    </View>
                    {COLUMNS.map((c) => {
                      const value = (row as unknown as Record<string, number | undefined>)[c.key] ?? 0;
                      const color = c.key === 'won' ? t.success : c.key === 'lost' ? t.danger : c.key === 'league_points' ? t.primary : t.textSecondary;
                      return <Text key={c.key} style={{ width: c.width, textAlign: 'center', color, fontSize: 14, fontWeight: c.key === 'league_points' ? '800' : '500' }}>{value}</Text>;
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </TournamentFrame>
  );
}
