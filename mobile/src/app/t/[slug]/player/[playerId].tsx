import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { PlayerAwards } from '@/components/awards';
import { StatsPanel, type Stats } from '@/components/stats';
import { Text } from '@/components/text';
import { Loading, positionLabel, positionTone, TournamentFrame } from '@/components/tournament';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type PlayerStats = { player: { id: string; display_name: string; primary_position: string | null; height_cm: number | null }; stats: Stats };

export default function PlayerStatsScreen() {
  const { slug, playerId } = useLocalSearchParams<{ slug: string; playerId: string }>();
  const t = useTheme();
  const [data, setData] = useState<PlayerStats | null>(null);
  useEffect(() => {
    api.rpc('get_player_stats', { p_player_id: playerId }).then(({ data: d }) => setData(d as unknown as PlayerStats));
  }, [playerId]);
  const tone = positionTone(data?.player.primary_position ?? null, t);
  return (
    <TournamentFrame slug={slug} active="players">
      {!data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <View style={{ width: 64, height: 64, borderRadius: radius['2xl'], backgroundColor: tint(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: tone, fontSize: 24, fontWeight: '800' }}>{data.player.display_name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' }}>Player statistics</Text>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 }}>{data.player.display_name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>{[data.player.primary_position ? positionLabel(data.player.primary_position) : null, data.player.height_cm ? `${data.player.height_cm} cm` : null].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>Results of the teams this player has been on the squad of. Individual points are not recorded.</Text>
          <PlayerAwards playerId={playerId} />
          <StatsPanel stats={data.stats} />
        </>
      )}
    </TournamentFrame>
  );
}
