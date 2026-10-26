import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { tint, useTheme } from '@/theme';

type Row = { team_id: string; team_name: string; rank: number; played: number; won: number; drawn: number; lost: number; sets_won: number; sets_lost: number; points_for: number; points_against: number; league_points: number };
type Stage = { id: string; name: string; status: string; qualification_count: number | null; rows: Row[] };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** League tables of every league stage, with the qualification line. */
export default function OrganizerStandings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: e } = await api.from('tournament_stages').select('id,name,status,qualification_count').eq('tournament_id', id).eq('stage_type', 'LEAGUE').order('sequence');
      if (e) return setError(e.message);
      const tables = await Promise.all((data ?? []).map(async (s) => {
        const { data: rows } = await api.rpc('get_stage_standings', { p_stage_id: s.id as string });
        return { ...(s as Omit<Stage, 'rows'>), rows: (Array.isArray(rows) ? rows : []) as unknown as Row[] };
      }));
      setStages(tables);
    })();
  }, [id]);

  return (
    <OrganizerFrame id={id} current="standings" title="Standings" subtitle={name}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Authoritative league rankings using the saved points and tie-break rules.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!stages ? (error ? null : <Loading />) : null}
      {stages?.length === 0 ? <Empty text="No league stage has been configured yet. Set up the competition under Fixtures." /> : null}
      {stages?.map((stage) => {
        const q = stage.qualification_count ?? 0;
        return (
          <View key={stage.id} style={{ gap: 10 }}>
            <View>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{stage.name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>{stage.status}{q ? ` · Top ${q} qualify` : ''}</Text>
            </View>
            {stage.rows.length === 0 ? <Empty text="Standings will appear after league matches begin." /> : (
              <View style={[portalCard(t), { padding: 0, overflow: 'hidden' }]}>
                {stage.rows.map((row, index) => {
                  const qualified = row.rank <= q;
                  return (
                    <View key={row.team_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: t.border, backgroundColor: qualified ? tint(t.primary, 0.07) : 'transparent' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: qualified ? t.primary : t.surfaceMuted }}>
                        <Text style={{ color: qualified ? t.primaryText : t.textSecondary, fontSize: 14, fontWeight: '800' }}>{row.rank}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{row.team_name}</Text>
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>P {row.played} · W {row.won}{row.drawn ? ` · D ${row.drawn}` : ''} · L {row.lost} · sets {signed(row.sets_won - row.sets_lost)}</Text>
                      </View>
                      <Text accessibilityLabel={`${row.league_points} points`} style={{ color: t.primary, fontSize: 20, fontWeight: '800' }}>{row.league_points}</Text>
                    </View>
                  );
                })}
                <Text style={{ color: t.textMuted, fontSize: 11, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>P played · W won · D drawn · L lost · sets = set difference · right: points</Text>
              </View>
            )}
          </View>
        );
      })}
    </OrganizerFrame>
  );
}
