import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Tv } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { MatchShare } from '@/components/match-share';
import { Text } from '@/components/text';
import { Loading, shortOf, TournamentFrame, useTournament } from '@/components/tournament';
import { ErrorText, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { deriveCourt } from '@/lib/court';
import { useLiveMatch } from '@/lib/live';
import { radius, tint, useTheme } from '@/theme';

/** Public live scoreboard: the same layout as the web match page; sides and server follow the toss. */
export default function PublicMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { state, error, live } = useLiveMatch(id, 'get_public_match_state');
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const tournamentId = state?.match.tournament_id;
    if (tournamentId) api.from('public_tournament_view').select('slug').eq('id', tournamentId).maybeSingle().then(({ data }) => setSlug((data?.slug as string | undefined) ?? null));
  }, [state?.match.tournament_id]);
  const { teams, tournament } = useTournament(slug ?? '');

  if (!state || !slug) {
    return <TournamentFrame slug={slug ?? ''} active="fixtures">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</TournamentFrame>;
  }
  const { home_team: home, away_team: away, sets, match } = state;
  const completed = match.status === 'COMPLETED';
  const current = sets.find((s) => s.status === 'LIVE' || s.status === 'PENDING') ?? sets[sets.length - 1];
  const court = deriveCourt(sets, current, home.id, away.id);
  const left = court.leftId === away.id ? away : home;
  const right = left === home ? away : home;
  const won = (teamId: string) => sets.filter((s) => s.winner_team_id === teamId).length;
  const points = (teamId: string) => (teamId === home.id ? current?.home_score : current?.away_score) ?? 0;
  const winner = match.winner_team_id === home.id ? home : match.winner_team_id === away.id ? away : null;
  const colorOf = (team: { id: string }) => teams.find((x) => x.id === team.id)?.primary_color ?? null;

  const teamColumn = (team: typeof home) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius['2xl'], backgroundColor: colorOf(team) ?? t.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{shortOf(team)}</Text>
      </View>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{team.name}</Text>
      {!completed && court.servingId === team.id ? <StatusPill tone="primary" label="Serving" /> : null}
    </View>
  );

  return (
    <TournamentFrame slug={slug} active="fixtures">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable accessibilityRole="link" onPress={() => router.replace({ pathname: '/t/[slug]/fixtures', params: { slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <CalendarDays size={16} color={t.textSecondary} /><Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>All fixtures</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!live && !completed ? <StatusPill tone="warning" label="Reconnecting" /> : null}
          <Pressable accessibilityRole="link" accessibilityLabel="TV scoreboard" onPress={() => router.push({ pathname: '/match/tv/[id]', params: { id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <Tv size={16} color={t.textSecondary} /><Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>TV</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: t.textMuted, fontSize: 13, flex: 1 }} numberOfLines={1}>{[match.venue, match.court ? `Court ${match.court}` : null, `#${match.match_number ?? '—'}`].filter(Boolean).join(' · ')}</Text>
          <StatusPill status={match.status} label={completed ? 'Final' : undefined} tone={completed ? 'success' : undefined} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {teamColumn(left)}
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text accessibilityLabel={`${left.name} sets won ${won(left.id)}`} style={{ color: won(left.id) >= won(right.id) ? t.text : t.textMuted, fontSize: 44, fontWeight: '800' }}>{won(left.id)}</Text>
              <Text style={{ color: t.textMuted, fontSize: 22 }}>–</Text>
              <Text accessibilityLabel={`${right.name} sets won ${won(right.id)}`} style={{ color: won(right.id) >= won(left.id) ? t.text : t.textMuted, fontSize: 44, fontWeight: '800' }}>{won(right.id)}</Text>
            </View>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>Sets</Text>
          </View>
          {teamColumn(right)}
        </View>
        {!completed && current ? (
          <View style={{ backgroundColor: t.surfaceMuted, borderRadius: radius['2xl'], paddingVertical: 14, alignItems: 'center' }}>
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>Set {current.set_number} · to {current.target_points} · Best of {sets.length}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text accessibilityLabel={`${left.name} points ${points(left.id)}`} style={{ color: t.text, fontSize: 42, fontWeight: '800' }}>{points(left.id)}</Text>
              <Text style={{ color: t.textMuted, fontSize: 24 }}>:</Text>
              <Text accessibilityLabel={`${right.name} points ${points(right.id)}`} style={{ color: t.text, fontSize: 42, fontWeight: '800' }}>{points(right.id)}</Text>
            </View>
          </View>
        ) : null}
        {completed && winner ? <View style={{ backgroundColor: tint(t.warning, 0.1), borderRadius: radius.xl, paddingVertical: 12 }}><Text style={{ color: t.warning, textAlign: 'center', fontWeight: '700' }}>{winner.name} wins</Text></View> : null}
      </View>

      {sets.some((s) => s.status === 'COMPLETED') ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>Set scores</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {sets.filter((s) => s.status === 'COMPLETED').map((s) => (
              <View key={s.set_number} style={{ minWidth: 80, borderRadius: radius.xl, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center' }}>
                <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Set {s.set_number}</Text>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{s.home_score} – {s.away_score}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {tournament ? <MatchShare state={state} slug={slug} tournament={{ id: tournament.id, name: tournament.name, venue: tournament.venue }} /> : null}
    </TournamentFrame>
  );
}
