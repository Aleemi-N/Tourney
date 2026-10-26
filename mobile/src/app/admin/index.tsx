import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AdminFrame, adminDate } from '@/components/admin';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Metrics = {
  pending_approvals: number; approved_tournaments: number; active_tournaments: number; completed_tournaments: number; organizer_count: number; player_count: number; team_count: number;
  recent_submissions: { id: string; name: string; approval_status: string; approval_submitted_at: string | null; organizer_name: string }[] | null;
  recent_reviews: { tournament_id: string; event: string; created_at: string; reason: string | null }[] | null;
};

/** Platform numbers and the latest submissions and reviews. */
export default function AdminOverview() {
  const t = useTheme();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.rpc('platform_dashboard_metrics').then(({ data, error: e }) => (e ? setError('Failed to load platform metrics.') : setM(data as unknown as Metrics)));
  }, []);
  const tile = (label: string, value: number, hot = false) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 140, padding: 16, gap: 2 }, hot && value > 0 ? { borderColor: t.warning } : null]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{value}</Text>
    </View>
  );
  return (
    <AdminFrame current="index" title="Platform" subtitle="Super admin">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!m ? (error ? null : <Loading />) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tile('Pending approvals', m.pending_approvals, true)}
            {tile('Approved', m.approved_tournaments)}
            {tile('Active', m.active_tournaments)}
            {tile('Completed', m.completed_tournaments)}
            {tile('Organizers', m.organizer_count)}
            {tile('Players', m.player_count)}
            {tile('Teams', m.team_count)}
          </View>
          <Section title="Recent submissions">
            {!m.recent_submissions?.length ? <Empty text="No submissions yet." /> : m.recent_submissions.map((s) => (
              <View key={s.id} style={portalCard(t)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }}>{s.name}</Text>
                  <StatusPill status={s.approval_status} />
                </View>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{s.organizer_name} · {adminDate(s.approval_submitted_at)}</Text>
              </View>
            ))}
          </Section>
          <Section title="Recent reviews">
            {!m.recent_reviews?.length ? <Empty text="No reviews yet." /> : m.recent_reviews.map((r, i) => (
              <View key={`${r.tournament_id}-${i}`} style={portalCard(t)}>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{r.event.replace(/_/g, ' ')}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{adminDate(r.created_at)}{r.reason ? ` · ${r.reason}` : ''}</Text>
              </View>
            ))}
          </Section>
        </>
      )}
    </AdminFrame>
  );
}
