import { router, useLocalSearchParams } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Empty, Loading, PageTitle, shortOf, Tile, TournamentFrame, useTournament } from '@/components/tournament';
import { api } from '@/lib/api';
import { radius, useTheme } from '@/theme';

type Result = {
  id: string; match_number: number | null; home_team_id: string | null; away_team_id: string | null; winner_team_id: string | null;
  total_home_score: number | null; total_away_score: number | null; home_sets_won: number | null; away_sets_won: number | null; result_type: string | null;
};

export default function ResultsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams } = useTournament(slug);
  const [results, setResults] = useState<Result[] | null>(null);
  useEffect(() => {
    if (!tournament) return;
    api.from('public_fixture_view')
      .select('id,match_number,home_team_id,away_team_id,winner_team_id,total_home_score,total_away_score,home_sets_won,away_sets_won,result_type')
      .eq('tournament_id', tournament.id).eq('status', 'COMPLETED').order('match_number', { ascending: false })
      .then(({ data }) => setResults((data as Result[]) ?? []));
  }, [tournament]);
  const byId = Object.fromEntries(teams.map((x) => [x.id, x]));

  const row = (result: Result, teamId: string | null, sets: number | null) => {
    const team = teamId ? byId[teamId] : undefined;
    const won = !!teamId && result.winner_team_id === teamId;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
        <Tile label={team ? shortOf(team) : 'TBD'} />
        <Text numberOfLines={1} style={{ flex: 1, color: won ? t.text : t.textMuted, fontSize: 15, fontWeight: '700' }}>{team?.name ?? 'TBD'}</Text>
        {won ? <Trophy size={16} color={t.warning} /> : null}
        <Text style={{ color: won ? t.text : t.textMuted, fontSize: 22, fontWeight: '800', minWidth: 24, textAlign: 'right' }}>{sets ?? 0}</Text>
      </View>
    );
  };

  return (
    <TournamentFrame slug={slug} active="results">
      <PageTitle eyebrow="Completed matches" title="Results" />
      {results === null ? <Loading /> : null}
      {results && results.length === 0 ? <Empty text="Match results will appear here once games are completed." /> : null}
      {results?.map((r) => (
        <Pressable key={r.id} accessibilityRole="link" accessibilityLabel={`Match ${r.match_number}`} onPress={() => router.push({ pathname: '/match/[id]', params: { id: r.id } })}
          style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
          <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 }}>
            Match {r.match_number ?? '—'}{r.result_type === 'WALKOVER' ? ' · Walkover' : r.result_type === 'DRAW' ? ' · Draw' : ''}
          </Text>
          {row(r, r.home_team_id, r.home_sets_won)}
          <View style={{ height: 1, backgroundColor: t.border }} />
          {row(r, r.away_team_id, r.away_sets_won)}
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>Total points: {r.total_home_score ?? 0} – {r.total_away_score ?? 0}</Text>
        </Pressable>
      ))}
    </TournamentFrame>
  );
}
