import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { AdminFrame, adminDate } from '@/components/admin';
import { Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = { user_id: string; profiles: { id: string; full_name: string | null; email: string | null; status: string; created_at: string } | null; organizations: { id: string; name: string } | null };

/** Organizer accounts: suspend or reactivate. Suspending never deletes tournament data. */
export default function AdminOrganizers() {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await api.from('organization_members').select('user_id,profiles(id,full_name,email,status,created_at),organizations(id,name)').eq('role', 'OWNER').eq('status', 'ACTIVE');
    if (e) return setError('Failed to load organizers.');
    setRows(data as unknown as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function change(key: string, action: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    setBusy(key); setError(null);
    const { data, error: e } = await action();
    setBusy(null);
    const ok = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
    if (e || ok?.ok !== true) return setError(e?.message ?? 'The change could not be saved.');
    setSuspending(null); setReason('');
    await load();
  }

  return (
    <AdminFrame current="organizers" title="Organizers" subtitle="Manage organizer accounts">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Empty text="No organizers yet." /> : (
        <>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{rows.length} organizer{rows.length === 1 ? '' : 's'}</Text>
          {rows.map((r) => {
            const p = r.profiles;
            if (!p) return null;
            const suspended = p.status === 'SUSPENDED';
            return (
              <View key={r.user_id} style={[portalCard(t), { gap: 8 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{p.full_name ?? 'Organizer'}</Text>
                    {p.email ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>{p.email}</Text> : null}
                  </View>
                  <Pill label={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'live' : 'success'} />
                </View>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>{[r.organizations?.name, `Joined ${adminDate(p.created_at)}`].filter(Boolean).join(' · ')}</Text>
                {suspended ? (
                  <Button tone="secondary" title="Reactivate" accessibilityLabel={`Reactivate ${p.full_name}`} loading={busy === p.id} disabled={busy !== null} onPress={() => void change(p.id, () => api.rpc('reactivate_organizer', { p_user_id: p.id }))} />
                ) : suspending === p.id ? (
                  <View style={{ gap: 10 }}>
                    <Field label="Reason (optional)" value={reason} onChangeText={setReason} />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setSuspending(null)} /></View>
                      <View style={{ flex: 1 }}><Button tone="danger-outline" title="Suspend" loading={busy === p.id} disabled={busy !== null} onPress={() => void change(p.id, () => api.rpc('suspend_organizer', { p_user_id: p.id, p_reason: reason.trim() || undefined }))} /></View>
                    </View>
                  </View>
                ) : <Button tone="danger-outline" title="Suspend" accessibilityLabel={`Suspend ${p.full_name}`} disabled={busy !== null} onPress={() => { setReason(''); setSuspending(p.id); }} />}
              </View>
            );
          })}
        </>
      )}
    </AdminFrame>
  );
}
