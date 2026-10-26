import { useLocalSearchParams } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatsPanel, type Stats } from '@/components/stats';
import { Text } from '@/components/text';
import { Loading, shortOf, TournamentFrame } from '@/components/tournament';
import { FollowButton } from '@/components/follow-button';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type TeamStats = { team: { id: string; name: string; short_name: string | null; place: string | null; primary_color: string | null }; stats: Stats };

export default function TeamStatsScreen() {
  const { slug, teamId } = useLocalSearchParams<{ slug: string; teamId: string }>();
  const t = useTheme();
  const [data, setData] = useState<TeamStats | null>(null);
  useEffect(() => {
    api.rpc('get_team_stats', { p_team_id: teamId }).then(({ data: d }) => setData(d as unknown as TeamStats));
  }, [teamId]);
  const accent = data?.team.primary_color ?? t.primary;
  return (
    <TournamentFrame slug={slug} active="teams">
      {!data ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <View style={{ width: 64, height: 64, borderRadius: radius['2xl'], backgroundColor: tint(accent, 0.14), borderWidth: 1, borderColor: tint(accent, 0.3), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: accent, fontSize: 18, fontWeight: '800' }}>{shortOf(data.team)}</Text>
            </View>
          <FollowButton kind="TEAM" targetId={teamId} name={data.team.name} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase' }}>Team statistics</Text>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 }}>{data.team.name}</Text>
              {data.team.place ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MapPin size={14} color={t.textMuted} /><Text style={{ color: t.textMuted, fontSize: 13 }}>{data.team.place}</Text></View> : null}
            </View>
          </View>
          <StatsPanel stats={data.stats} />
        </>
      )}
    </TournamentFrame>
  );
}
