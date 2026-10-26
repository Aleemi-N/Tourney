import { router, useLocalSearchParams } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { deriveCourt } from '@/lib/court';
import { useLiveMatch } from '@/lib/live';
import { onColor, palettes } from '@/theme';

const t = palettes.dark;

/** Full-screen scoreboard for a projector or a phone held in landscape. Always dark, read-only. */
export default function TvScoreboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, error, live } = useLiveMatch(id, 'get_public_match_state');
  const [colors, setColors] = useState<Record<string, string>>({});

  const homeId = state?.home_team.id;
  const awayId = state?.away_team.id;
  useEffect(() => {
    if (!homeId || !awayId) return;
    api.from('teams').select('id,primary_color').in('id', [homeId, awayId]).then(({ data }) => setColors(Object.fromEntries(((data ?? []) as { id: string; primary_color: string | null }[]).map((x) => [x.id, x.primary_color ?? '']))));
  }, [homeId, awayId]);

  const close = (
    <Pressable accessibilityRole="button" accessibilityLabel="Close scoreboard" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
      <X size={24} color={t.textSecondary} />
    </Pressable>
  );
  if (!state) return <SafeAreaView style={{ flex: 1, backgroundColor: t.background, justifyContent: 'center', padding: 24 }}>{close}{error ? <ErrorText>{error}</ErrorText> : <Loading />}</SafeAreaView>;

  const { home_team: home, away_team: away, sets, match } = state;
  const completed = match.status === 'COMPLETED';
  const current = completed ? [...sets].reverse().find((s) => s.status === 'COMPLETED') ?? sets[sets.length - 1] : sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const court = deriveCourt(sets, current, home.id, away.id);
  const left = court.leftId === away.id ? away : home;
  const right = left === home ? away : home;
  const won = (teamId: string) => sets.filter((s) => s.winner_team_id === teamId).length;
  const points = (teamId: string) => (teamId === home.id ? current?.home_score : current?.away_score) ?? 0;
  const winner = match.winner_team_id === home.id ? home : match.winner_team_id === away.id ? away : null;
  const colorOf = (teamId: string) => colors[teamId] || (teamId === home.id ? '#6366f1' : '#14b8a6');

  const side = (team: typeof home) => {
    const color = colorOf(team.id);
    const serving = !completed && court.servingId === team.id;
    return (
      <View key={team.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 8, borderTopColor: color, backgroundColor: `${color}1f`, paddingVertical: 12 }}>
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 26, fontWeight: '800', textAlign: 'center', paddingHorizontal: 12 }}>{team.name}</Text>
        <View style={{ height: 28, justifyContent: 'center' }}>
          {serving ? <View style={{ backgroundColor: color, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 3 }}><Text style={{ color: onColor(color), fontSize: 14, fontWeight: '800', letterSpacing: 1 }}>SERVING</Text></View> : null}
        </View>
        <Text accessibilityLabel={`${team.name} points ${points(team.id)}`} style={{ color: t.text, fontSize: 140, lineHeight: 150, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{points(team.id)}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 18, fontWeight: '700' }}>Sets {won(team.id)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      {close}
      <View style={{ paddingTop: 14, alignItems: 'center', gap: 4 }}>
        <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' }}>{[match.venue, match.court ? `Court ${match.court}` : null, `Match ${match.match_number ?? '—'}`].filter(Boolean).join(' · ')}</Text>
        <Text style={{ color: completed ? t.success : t.live, fontSize: 16, fontWeight: '900', letterSpacing: 3 }}>{completed ? 'FINAL' : live ? `LIVE · SET ${current?.set_number ?? 1}` : 'RECONNECTING…'}</Text>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', marginTop: 8 }}>{[left, right].map(side)}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, padding: 12, flexWrap: 'wrap' }}>
        {sets.filter((s) => s.status !== 'PENDING' || s.home_score + s.away_score > 0).map((s) => (
          <View key={s.set_number} style={{ backgroundColor: t.surface, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700' }}>SET {s.set_number}</Text>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{s.home_score} – {s.away_score}</Text>
          </View>
        ))}
      </View>
      {winner ? <Text style={{ color: t.success, fontSize: 22, fontWeight: '900', textAlign: 'center', paddingBottom: 14 }}>{winner.name} wins</Text> : null}
    </SafeAreaView>
  );
}
