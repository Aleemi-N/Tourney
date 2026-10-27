import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { tint, useTheme } from '@/theme';

type Analytics = {
  players: { total: number; approved: number; pending: number; rejected: number; withdrawn: number };
  teams: { applications: number; approved: number; pending: number; rejected: number };
  registrations_per_day: { day: string; players: number; teams: number }[];
  matches: { total: number; completed: number; walkovers: number; draws: number; postponed: number; cancelled: number; live: number };
  durations: { played: number; average_minutes: number | null; shortest_minutes: number | null; longest_minutes: number | null };
  sets: { played: number; average_points: number | null };
  checkins: { matches: number; both_teams: number };
  busiest_courts: { court: string; matches: number }[];
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const minutes = (m: number | null) => (m === null ? '—' : m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

/** A horizontal bar: label, a bar sized against the largest value, and the number. */
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: t.textSecondary, fontSize: 13 }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>{value}</Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.surfaceMuted, overflow: 'hidden' }}>
        <View style={{ height: 10, width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0}%`, backgroundColor: color, borderRadius: 5 }} />
      </View>
    </View>
  );
}

/** How the tournament is going: registrations, matches, timings and check-in. */
export default function OrganizerInsights() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [a, setA] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.rpc('get_tournament_analytics', { p_tournament_id: id }).then(({ data, error: e }) => (e ? setError(e.message) : setA(data as unknown as Analytics)));
  }, [id]);

  const tile = (label: string, value: string, hint?: string) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 140, padding: 16, gap: 2 }]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{value}</Text>
      {hint ? <Text style={{ color: t.textMuted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );

  return (
    <OrganizerFrame id={id} current="insights" title="Insights" subtitle={name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!a ? (error ? null : <Loading />) : (
        <>
          <Section title="Registrations">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {tile('Players', String(a.players.total), `${pct(a.players.approved, a.players.total)} approved`)}
              {tile('Team applications', String(a.teams.applications), `${a.teams.approved} approved`)}
            </View>
            <View style={[portalCard(t), { gap: 10 }]}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Players by decision</Text>
              <Bar label="Approved" value={a.players.approved} max={a.players.total} color={t.success} />
              <Bar label="Waiting" value={a.players.pending} max={a.players.total} color={t.warning} />
              <Bar label="Rejected" value={a.players.rejected} max={a.players.total} color={t.danger} />
              {a.players.withdrawn > 0 ? <Bar label="Withdrawn" value={a.players.withdrawn} max={a.players.total} color={t.textMuted} /> : null}
            </View>
            {a.registrations_per_day.length > 0 ? (
              <View style={[portalCard(t), { gap: 10 }]}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Registrations per day</Text>
                {a.registrations_per_day.slice(-14).map((d) => (
                  <Bar key={d.day} label={new Date(`${d.day}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} value={d.players + d.teams} max={Math.max(...a.registrations_per_day.map((x) => x.players + x.teams))} color={t.primary} />
                ))}
              </View>
            ) : null}
          </Section>

          <Section title="Matches">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {tile('Played', `${a.matches.completed} / ${a.matches.total}`, a.matches.live > 0 ? `${a.matches.live} live now` : undefined)}
              {tile('Walkovers', String(a.matches.walkovers), `${pct(a.matches.walkovers, a.matches.completed)} of finished`)}
              {a.matches.draws > 0 ? tile('Draws', String(a.matches.draws)) : null}
              {a.matches.postponed + a.matches.cancelled > 0 ? tile('Postponed or cancelled', String(a.matches.postponed + a.matches.cancelled)) : null}
            </View>
            <View style={[portalCard(t), { gap: 6 }]}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>How long matches take</Text>
              {a.durations.played > 0 ? (
                <>
                  <Text style={{ color: t.textSecondary, fontSize: 14 }}>Average {minutes(a.durations.average_minutes)} over {a.durations.played} match{a.durations.played === 1 ? '' : 'es'}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>Shortest {minutes(a.durations.shortest_minutes)} · longest {minutes(a.durations.longest_minutes)}</Text>
                </>
              ) : <Text style={{ color: t.textMuted, fontSize: 13 }}>Timings appear once matches are scored live.</Text>}
              {a.sets.played > 0 ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{a.sets.played} sets played, {a.sets.average_points ?? '—'} points per set on average</Text> : null}
            </View>
          </Section>

          <Section title="On the day">
            <View style={[portalCard(t), { gap: 6 }]}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Check-in</Text>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>{a.checkins.matches === 0 ? 'No team has checked in yet.' : `${a.checkins.both_teams} of ${a.checkins.matches} matches had both teams check in (${pct(a.checkins.both_teams, a.checkins.matches)}).`}</Text>
            </View>
            {a.busiest_courts.length > 0 ? (
              <View style={[portalCard(t), { gap: 10 }]}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Matches per court</Text>
                {a.busiest_courts.map((c) => <Bar key={c.court} label={`Court ${c.court}`} value={c.matches} max={a.busiest_courts[0].matches} color={tint(t.primary, 0.9)} />)}
              </View>
            ) : null}
          </Section>
        </>
      )}
    </OrganizerFrame>
  );
}
