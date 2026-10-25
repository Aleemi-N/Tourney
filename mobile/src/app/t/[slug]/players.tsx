import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Empty, Loading, PageTitle, positionLabel, positionTone, TournamentFrame, useTournament } from '@/components/tournament';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type Player = { id: string; display_name: string | null; primary_position: string | null; secondary_position: string | null; team_id: string | null };

export default function PlayersScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams } = useTournament(slug);
  const [players, setPlayers] = useState<Player[] | null>(null);
  useEffect(() => {
    if (!tournament) return;
    api.from('public_player_view').select('id,display_name,primary_position,secondary_position,team_id').eq('tournament_id', tournament.id).order('display_name')
      .then(({ data }) => setPlayers((data as Player[]) ?? []));
  }, [tournament]);
  const teamName = (id: string | null) => teams.find((x) => x.id === id)?.name ?? null;

  return (
    <TournamentFrame slug={slug} active="players">
      <PageTitle eyebrow="Approved players" title="Players" subtitle={players?.length ? `${players.length} player${players.length === 1 ? '' : 's'}` : undefined} />
      {players === null ? <Loading /> : null}
      {players && players.length === 0 ? <Empty text="Players will appear here once their registrations are approved." /> : null}
      {players?.map((p) => {
        const tone = positionTone(p.primary_position, t);
        return (
          <Pressable key={p.id} accessibilityRole="link" accessibilityLabel={p.display_name ?? 'Player'} onPress={() => router.push({ pathname: '/t/[slug]/player/[playerId]', params: { slug, playerId: p.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16 }}>
            <View style={{ width: 48, height: 48, borderRadius: radius.xl, backgroundColor: tint(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: tone, fontSize: 16, fontWeight: '800' }}>{(p.display_name ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{p.display_name}</Text>
              {p.primary_position ? (
                <View style={{ alignSelf: 'flex-start', backgroundColor: tint(tone, 0.12), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
                  <Text style={{ color: tone, fontSize: 12, fontWeight: '600' }}>{positionLabel(p.primary_position)}{p.secondary_position ? ` · ${positionLabel(p.secondary_position)}` : ''}</Text>
                </View>
              ) : null}
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{[teamName(p.team_id), 'Registered'].filter(Boolean).join(' · ')}</Text>
            </View>
          </Pressable>
        );
      })}
    </TournamentFrame>
  );
}
