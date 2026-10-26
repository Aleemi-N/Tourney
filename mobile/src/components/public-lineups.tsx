import { View } from 'react-native';
import { LineupsCard, useLineups } from '@/components/lineups';
import { Text } from '@/components/text';
import { deriveCourt } from '@/lib/court';
import type { MatchState } from '@/lib/live';
import { useTheme } from '@/theme';

/** Lineups on the public match screen: who is on court in the current set, and the player of the match. */
export function PublicLineups({ matchId, state, colors }: { matchId: string; state: MatchState; colors: Record<string, string> }) {
  const t = useTheme();
  const { home_team: home, away_team: away, sets } = state;
  const current = sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const { data } = useLineups(matchId, sets.map((s) => `${s.home_score}-${s.away_score}-${s.status}`).join('|'));
  const court = current ? deriveCourt(sets, current, home.id, away.id) : null;
  if (!data) return null;
  return (
    <View style={{ gap: 12 }}>
      {data.mvp ? <View style={{ borderRadius: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, padding: 14 }}><Text style={{ color: t.warning, fontSize: 15, fontWeight: '800' }}>🏆 Player of the match: {data.mvp.name}</Text></View> : null}
      {current ? <LineupsCard data={data} setNumber={current.set_number} teams={[home, away]} colors={colors} servingId={state.match.status === 'COMPLETED' ? null : court?.servingId ?? null} /> : null}
    </View>
  );
}
