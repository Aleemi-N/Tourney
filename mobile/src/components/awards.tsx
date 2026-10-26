import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type TournamentAward = { id: string; name: string; player_id: string; player_name: string; note: string | null };
type PlayerAward = { kind: 'MVP' | 'TOURNAMENT'; title: string; tournament_name: string; tournament_slug: string; detail: string | null };

const trophy = (t: ReturnType<typeof useTheme>) => ({ borderRadius: radius.xl, borderWidth: 1, borderColor: tint(t.warning, 0.3), backgroundColor: tint(t.warning, 0.08), padding: 14, gap: 2 }) as const;

/** The awards of a tournament, for its public page. Renders nothing when there are none. */
export function TournamentAwards({ tournamentId, slug }: { tournamentId: string; slug: string }) {
  const t = useTheme();
  const [awards, setAwards] = useState<TournamentAward[]>([]);
  useEffect(() => {
    api.rpc('get_tournament_awards', { p_tournament_id: tournamentId }).then(({ data }) => setAwards((data ?? []) as unknown as TournamentAward[]));
  }, [tournamentId]);
  if (awards.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Awards</Text>
      {awards.map((a) => (
        <Pressable key={a.id} accessibilityRole="link" accessibilityLabel={`${a.name}: ${a.player_name}`} onPress={() => router.push({ pathname: '/t/[slug]/player/[playerId]', params: { slug, playerId: a.player_id } })} style={trophy(t)}>
          <Text style={{ color: t.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>🏆 {a.name}</Text>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{a.player_name}</Text>
          {a.note ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>{a.note}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** A player's awards across tournaments, for the player page. */
export function PlayerAwards({ playerId }: { playerId: string }) {
  const t = useTheme();
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  useEffect(() => {
    api.rpc('get_player_awards', { p_player_id: playerId }).then(({ data }) => setAwards((data ?? []) as unknown as PlayerAward[]));
  }, [playerId]);
  if (awards.length === 0) return null;
  const mvps = awards.filter((a) => a.kind === 'MVP');
  const others = awards.filter((a) => a.kind !== 'MVP');
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Awards</Text>
      {others.map((a, i) => (
        <View key={`${a.title}${i}`} style={trophy(t)}>
          <Text style={{ color: t.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>🏆 {a.title}</Text>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{a.tournament_name}</Text>
          {a.detail ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>{a.detail}</Text> : null}
        </View>
      ))}
      {mvps.length > 0 ? (
        <View style={trophy(t)}>
          <Text style={{ color: t.warning, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>🏆 Player of the match × {mvps.length}</Text>
          {mvps.slice(0, 5).map((a, i) => <Text key={i} style={{ color: t.textSecondary, fontSize: 13 }}>{a.detail} · {a.tournament_name}</Text>)}
        </View>
      ) : null}
    </View>
  );
}
