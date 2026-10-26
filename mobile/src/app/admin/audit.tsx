import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AdminFrame } from '@/components/admin';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = { id: string; action: string; reason: string | null; created_at: string; profiles: { full_name: string | null } | null; tournaments: { name: string } | null };
const ACTIONS = ['TOURNAMENT_SUBMITTED_FOR_APPROVAL', 'TOURNAMENT_APPROVED', 'TOURNAMENT_REJECTED', 'TOURNAMENT_GRANDFATHERED_APPROVED', 'ORGANIZER_SUSPENDED', 'ORGANIZER_REACTIVATED'];

/** The latest platform decisions: approvals, rejections and organizer changes. */
export default function AdminAudit() {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.from('audit_logs').select('id,action,reason,created_at,profiles!user_id(full_name),tournaments(name)').in('action', ACTIONS).order('created_at', { ascending: false }).limit(50)
      .then(({ data, error: e }) => (e ? setError('Failed to load audit log.') : setRows(data as unknown as Row[])));
  }, []);
  return (
    <AdminFrame current="audit" title="Audit log" subtitle="Latest platform decisions">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Empty text="No decisions recorded yet." /> : rows.map((r) => (
        <View key={r.id} style={[portalCard(t), { gap: 2 }]}>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', letterSpacing: 0.4 }}>{r.action.replace(/_/g, ' ')}</Text>
          {r.tournaments?.name ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>{r.tournaments.name}</Text> : null}
          {r.reason ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>Reason: {r.reason}</Text> : null}
          <Text style={{ color: t.textMuted, fontSize: 12 }}>{r.profiles?.full_name ?? 'System'} · {new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
        </View>
      ))}
    </AdminFrame>
  );
}
