import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { radius, useTheme } from '@/theme';

export type StatsTotals = { played: number; won: number; lost: number; drawn: number; sets_for: number; sets_against: number; points_for: number; points_against: number; tournaments: number };
export type StatsRow = Omit<StatsTotals, 'tournaments'> & { tournament_id: string; name: string; slug: string };
export type Stats = { totals: StatsTotals; tournaments: StatsRow[] };

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Totals and a per-tournament table, the same figures as the web's team and player pages. */
export function StatsPanel({ stats }: { stats: Stats }) {
  const t = useTheme();
  const { totals } = stats;
  if (totals.played === 0) return <Empty text="No completed matches yet." />;
  const rate = Math.round((totals.won / totals.played) * 100);
  const tiles: [string, string | number][] = [
    ['Matches', totals.played], ['Won', totals.won], ['Lost', totals.lost], ['Drawn', totals.drawn], ['Win rate', `${rate}%`],
    ['Sets', `${totals.sets_for}–${totals.sets_against}`], ['Points', `${totals.points_for}–${totals.points_against}`], ['Point diff', signed(totals.points_for - totals.points_against)],
  ];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tiles.map(([label, value]) => (
          <View key={label} style={{ width: '47.5%', borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
            <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 4 }}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, overflow: 'hidden' }}>
        <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600', padding: 16, paddingBottom: 8 }}>By tournament</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {stats.tournaments.map((row) => (
              <View key={row.tournament_id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: 16 }}>
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/t/[slug]', params: { slug: row.slug } })} style={{ width: 180 }}>
                  <Text numberOfLines={1} style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>{row.name}</Text>
                </Pressable>
                {[['P', row.played], ['W', row.won], ['D', row.drawn], ['L', row.lost], ['Sets', `${row.sets_for}–${row.sets_against}`], ['Pts', `${row.points_for}–${row.points_against}`]].map(([k, v]) => (
                  <Text key={String(k)} accessibilityLabel={`${k} ${v}`} style={{ width: 62, textAlign: 'center', color: t.textSecondary, fontSize: 14 }}>{String(v)}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
