import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Heading, Loading, Pill, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Standing = { stage_id: string; team_id: string; team_name: string; played: number; won: number; lost: number; drawn?: number; league_points: number; sets_won: number; sets_lost: number };
type Fixture = { id: string; match_number: number | null; status: string; home_team_id: string | null; away_team_id: string | null; scheduled_at: string | null; home_sets_won: number | null; away_sets_won: number | null; program_order: number | null };
type Tab = 'table' | 'fixtures' | 'results';

export default function TournamentScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>('table');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: tournament, error: e } = await api.from('public_tournament_view').select('id,name,status').eq('slug', slug).maybeSingle();
      if (e || !tournament) return setError(e?.message ?? 'Tournament not found');
      setName(tournament.name as string);
      setStatus(tournament.status as string);
      const [rows, fx, tm] = await Promise.all([
        api.rpc('get_public_standings', { p_tournament_id: tournament.id as string }),
        api.from('public_fixture_view').select('id,match_number,status,home_team_id,away_team_id,scheduled_at,home_sets_won,away_sets_won,program_order').eq('tournament_id', tournament.id as string).order('program_order'),
        api.from('public_team_view').select('id,name').eq('tournament_id', tournament.id as string),
      ]);
      setStandings((rows.data as unknown as Standing[]) ?? []);
      setFixtures((fx.data as Fixture[]) ?? []);
      setTeams(Object.fromEntries(((tm.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    })();
  }, [slug]);

  const teamName = (id: string | null) => (id ? teams[id] ?? 'TBD' : 'TBD');
  const shown = (fixtures ?? []).filter((f) => (tab === 'results' ? f.status === 'COMPLETED' : f.status !== 'COMPLETED'));

  return (
    <Screen>
      <Stack.Screen options={{ title: name || 'Tournament' }} />
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
        {(['table', 'fixtures', 'results'] as Tab[]).map((id) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)}
            style={{ flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === id ? t.primary : t.surfaceMuted }}>
            <Text style={{ fontWeight: '600', color: tab === id ? t.primaryText : t.text, textTransform: 'capitalize' }}>{id}</Text>
          </Pressable>
        ))}
      </View>
      {status === 'REGISTRATION' ? (
        <Card>
          <Heading>Registration is open</Heading>
          <Link href={{ pathname: '/register/player/[slug]', params: { slug } }} asChild><Button title="Register as a player" onPress={() => {}} /></Link>
          <Link href={{ pathname: '/register/team/[slug]', params: { slug } }} asChild><Button tone="secondary" title="Apply with a team" onPress={() => {}} /></Link>
        </Card>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {standings === null && !error ? <Loading /> : null}

      {tab === 'table' && standings ? (
        <Card>
          {standings.length === 0 ? <Body muted>The table fills in once matches are played.</Body> : null}
          {standings.map((row, index) => (
            <View key={`${row.stage_id}-${row.team_id}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
              <Text style={{ width: 22, color: t.textMuted, fontWeight: '700' }}>{index + 1}</Text>
              <Text style={{ flex: 1, color: t.text, fontWeight: '600' }} numberOfLines={1}>{row.team_name}</Text>
              <Text style={{ color: t.textSecondary, width: 60, textAlign: 'right' }}>{row.won}-{row.drawn ? `${row.drawn}-` : ''}{row.lost}</Text>
              <Text style={{ color: t.primary, fontWeight: '800', width: 34, textAlign: 'right' }}>{row.league_points}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {tab !== 'table' ? shown.map((f) => (
        <Link key={f.id} href={{ pathname: '/match/[id]', params: { id: f.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${teamName(f.home_team_id)} versus ${teamName(f.away_team_id)}`}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body muted>Match {f.match_number ?? '—'}</Body>
                {f.status === 'LIVE' ? <Pill label="Live" tone="live" /> : f.status === 'COMPLETED' ? <Pill label="Final" tone="success" /> : null}
              </View>
              <Heading>{teamName(f.home_team_id)}{f.status === 'COMPLETED' ? `  ${f.home_sets_won ?? 0}` : ''}</Heading>
              <Heading>{teamName(f.away_team_id)}{f.status === 'COMPLETED' ? `  ${f.away_sets_won ?? 0}` : ''}</Heading>
              {f.scheduled_at ? <Body muted>{new Date(f.scheduled_at).toLocaleString()}</Body> : null}
            </Card>
          </Pressable>
        </Link>
      )) : null}
      {tab !== 'table' && fixtures && shown.length === 0 ? <Body muted>Nothing here yet.</Body> : null}
    </Screen>
  );
}
