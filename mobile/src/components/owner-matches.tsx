import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { OwnerTeam } from '@/components/owner';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = {
  id: string; match_number: number | null; scheduled_at: string | null; venue: string | null; court: string | null; status: string;
  home_team_id: string | null; away_team_id: string | null; total_home_score: number | null; total_away_score: number | null; winner_team_id?: string | null;
};

/** The team's upcoming fixtures, or its completed results. */
export function OwnerMatches({ team, results }: { team: OwnerTeam; results: boolean }) {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      let q = api.from('public_fixture_view').select('id,match_number,scheduled_at,venue,court,status,home_team_id,away_team_id,total_home_score,total_away_score,winner_team_id')
        .eq('tournament_id', team.tournament_id).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`);
      q = results ? q.in('status', ['COMPLETED', 'FINAL']).order('scheduled_at', { ascending: false }) : q.not('status', 'in', '(COMPLETED,FINAL)').order('scheduled_at', { nullsFirst: false });
      const { data } = await q;
      const list = (data as unknown as Row[]) ?? [];
      const ids = [...new Set(list.flatMap((r) => [r.home_team_id, r.away_team_id]).filter((id): id is string => Boolean(id)))];
      if (ids.length) {
        const { data: teams } = await api.from('teams').select('id,name').in('id', ids);
        setNames(Object.fromEntries(((teams ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
      }
      setRows(list);
    })();
  }, [team, results]);

  if (!rows) return <Loading />;
  if (rows.length === 0) return <Empty text={results ? 'No completed matches yet.' : 'No upcoming fixtures yet.'} />;
  return (
    <>
      {rows.map((r) => {
        const won = r.winner_team_id === team.id;
        const when = r.scheduled_at ? new Date(r.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time to be announced';
        return (
          <View key={r.id} style={[portalCard(t), { gap: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>Match {r.match_number ?? '—'}</Text>
              {results ? <StatusPill tone={won ? 'success' : 'neutral'} label={won ? 'Won' : r.winner_team_id ? 'Lost' : 'Played'} /> : <StatusPill status={r.status} />}
            </View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{names[r.home_team_id ?? ''] ?? 'TBD'} <Text style={{ color: t.textMuted, fontWeight: '500' }}>vs</Text> {names[r.away_team_id ?? ''] ?? 'TBD'}</Text>
            {results ? <Text style={{ color: t.primary, fontSize: 22, fontWeight: '800' }}>{r.total_home_score ?? 0} – {r.total_away_score ?? 0} <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: '500' }}>sets</Text></Text> : null}
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>{when}{r.venue ? ` · ${r.venue}` : ''}{r.court ? ` · ${r.court}` : ''}</Text>
          </View>
        );
      })}
    </>
  );
}
