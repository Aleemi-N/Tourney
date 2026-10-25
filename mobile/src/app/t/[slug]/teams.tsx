import { router, useLocalSearchParams } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { Empty, Loading, PageTitle, shortOf, TournamentFrame, useTournament } from '@/components/tournament';
import { radius, tint, useTheme } from '@/theme';

export default function TeamsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const { tournament, teams } = useTournament(slug);
  return (
    <TournamentFrame slug={slug} active="teams">
      <PageTitle eyebrow="Tournament teams" title="Teams" subtitle={teams.length ? `${teams.length} team${teams.length === 1 ? '' : 's'} registered` : undefined} />
      {tournament === undefined ? <Loading /> : null}
      {tournament && teams.length === 0 ? <Empty text="Teams will appear here once registrations are approved." /> : null}
      {teams.map((team) => {
        const accent = team.primary_color ?? t.primary;
        return (
          <Pressable key={team.id} accessibilityRole="link" accessibilityLabel={team.name} onPress={() => router.push({ pathname: '/t/[slug]/team/[teamId]', params: { slug, teamId: team.id } })}
            style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 20, gap: 4 }}>
            <View style={{ width: 56, height: 56, borderRadius: radius['2xl'], backgroundColor: tint(accent, 0.14), borderWidth: 1, borderColor: tint(accent, 0.3), alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' }}>
              <Text style={{ color: accent, fontSize: 16, fontWeight: '800' }}>{shortOf(team)}</Text>
            </View>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{team.name}</Text>
            {team.short_name && team.short_name !== team.name ? <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }}>{team.short_name.toUpperCase()}</Text> : null}
            {team.place ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}><MapPin size={14} color={t.textMuted} /><Text style={{ color: t.textMuted, fontSize: 13 }}>{team.place}</Text></View> : null}
          </Pressable>
        );
      })}
    </TournamentFrame>
  );
}
