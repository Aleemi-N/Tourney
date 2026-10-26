import { router } from 'expo-router';
import { Calendar, CalendarPlus, ExternalLink, MapPin } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { StatusPill } from '@/components/ui';
import { shortOf, Tile, type TeamInfo } from '@/components/tournament';
import { api } from '@/lib/api';
import { addToCalendar } from '@/lib/calendar';
import { radius, tint, useTheme } from '@/theme';

export type Fixture = {
  id: string; match_number: number | null; status: string; home_team_id: string | null; away_team_id: string | null; scheduled_at: string | null;
  venue: string | null; court: string | null; round_number: number | null; program_order: number | null; bracket_match_type?: string | null;
};

export const FIXTURE_COLUMNS = 'id,match_number,status,home_team_id,away_team_id,scheduled_at,venue,court,round_number,program_order,bracket_match_type';

export function useFixtures(tournamentId: string | undefined) {
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  useEffect(() => {
    if (!tournamentId) return;
    api.from('public_fixture_view').select(FIXTURE_COLUMNS).eq('tournament_id', tournamentId).order('round_number').order('program_order')
      .then(({ data }) => setFixtures((data as Fixture[]) ?? []));
  }, [tournamentId]);
  return fixtures;
}

export function FixtureCard({ fixture, teams }: { fixture: Fixture; teams: Record<string, TeamInfo> }) {
  const t = useTheme();
  const live = fixture.status === 'LIVE';
  const home = fixture.home_team_id ? teams[fixture.home_team_id] : undefined;
  const away = fixture.away_team_id ? teams[fixture.away_team_id] : undefined;
  const when = fixture.scheduled_at ? new Date(fixture.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  const side = (team: TeamInfo | undefined, right: boolean) => (
    <View style={{ flex: 1, flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
      <Tile label={team ? shortOf(team) : 'TBD'} />
      <Text numberOfLines={2} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '700', textAlign: right ? 'right' : 'left' }}>{team?.name ?? 'TBD'}</Text>
    </View>
  );
  return (
    <View style={{ borderRadius: radius['2xl'], borderWidth: 1, borderColor: live ? tint(t.live, 0.3) : t.border, backgroundColor: live ? tint(t.live, 0.06) : t.surface, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>#{fixture.program_order} · Match {fixture.match_number ?? '—'}</Text>
          <StatusPill status={fixture.status} />
        </View>
        {when ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Calendar size={14} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 13 }}>{when}</Text></View> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {side(home, false)}
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700' }}>vs</Text>
        {side(away, true)}
      </View>
      {fixture.venue ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MapPin size={14} color={t.textMuted} /><Text style={{ color: t.textSecondary, fontSize: 13 }}>{fixture.venue}{fixture.court ? ` · ${fixture.court}` : ''}</Text></View> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {fixture.scheduled_at && fixture.status !== 'COMPLETED' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Add to calendar" onPress={() => void addToCalendar({ title: `${home?.name ?? 'TBD'} vs ${away?.name ?? 'TBD'}`, start: new Date(fixture.scheduled_at!), location: [fixture.venue, fixture.court ? `Court ${fixture.court}` : null].filter(Boolean).join(', ') || null }).catch(() => {})} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
            <CalendarPlus size={16} color={t.text} /><Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>Add to calendar</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" accessibilityLabel="Match view" onPress={() => router.push({ pathname: '/match/[id]', params: { id: fixture.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <ExternalLink size={16} color={t.text} /><Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>Match view</Text>
        </Pressable>
      </View>
    </View>
  );
}

