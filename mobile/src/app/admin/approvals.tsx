import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AdminFrame, adminDate } from '@/components/admin';
import { Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = { id: string; name: string; format: string | null; league_mode: string | null; approval_submitted_at: string | null; profiles: { full_name: string | null } | null; organizations: { name: string } | null };

/** Tournaments waiting for approval: approve, or reject with a reason. */
export default function AdminApprovals() {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await api.from('tournaments').select('id,name,format,league_mode,approval_submitted_at,profiles!created_by(full_name),organizations(name)').eq('approval_status', 'PENDING_APPROVAL').order('approval_submitted_at');
    if (e) return setError('Failed to load approval queue.');
    setRows(data as unknown as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(id: string, key: string, action: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    setBusy(key); setError(null);
    const { data, error: e } = await action();
    setBusy(null);
    const ok = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
    if (e || ok?.ok !== true) return setError(e?.message ?? 'The decision could not be recorded.');
    setRejecting(null); setReason('');
    await load();
    return id;
  }

  return (
    <AdminFrame current="approvals" title="Approvals" subtitle="Review tournaments before they become public">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Empty text="No tournaments are waiting for approval." /> : rows.map((r) => (
        <View key={r.id} style={[portalCard(t), { gap: 10 }]}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{r.name}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>{[r.format ? r.format[0] + r.format.slice(1).toLowerCase() : null, r.league_mode === 'AUCTION' ? 'Auction' : null, r.organizations?.name, r.profiles?.full_name].filter(Boolean).join(' · ')}</Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>Submitted {adminDate(r.approval_submitted_at)}</Text>
          {rejecting === r.id ? (
            <View style={{ gap: 10 }}>
              <Field label="Rejection reason" value={reason} onChangeText={setReason} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setRejecting(null)} /></View>
                <View style={{ flex: 1 }}><Button tone="danger-outline" title="Reject" loading={busy === `r${r.id}`} disabled={reason.trim() === '' || busy !== null} onPress={() => void decide(r.id, `r${r.id}`, () => api.rpc('reject_tournament', { p_tournament_id: r.id, p_reason: reason.trim() }))} /></View>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button tone="danger-outline" title="Reject" accessibilityLabel={`Reject ${r.name}`} disabled={busy !== null} onPress={() => { setReason(''); setRejecting(r.id); }} /></View>
              <View style={{ flex: 1 }}><Button title="Approve" accessibilityLabel={`Approve ${r.name}`} loading={busy === `a${r.id}`} disabled={busy !== null} onPress={() => void decide(r.id, `a${r.id}`, () => api.rpc('approve_tournament', { p_tournament_id: r.id }))} /></View>
            </View>
          )}
        </View>
      ))}
    </AdminFrame>
  );
}
