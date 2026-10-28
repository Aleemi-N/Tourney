import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/form';
import { PhotoField } from '@/components/photo-field';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Sponsors, type Sponsor } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = Sponsor & { display_order: number };
const TIERS: { value: Sponsor['tier']; label: string }[] = [{ value: 'TITLE', label: 'Title sponsor' }, { value: 'SPONSOR', label: 'Sponsor' }, { value: 'PARTNER', label: 'Partner' }];
const blank = { id: null as string | null, name: '', website: '', tier: 'SPONSOR' as Sponsor['tier'], order: '0', logo: null as string | null };

/** The live stream link and the sponsors of the tournament, for its settings. */
export function StreamSponsors({ tournamentId }: { tournamentId: string }) {
  const t = useTheme();
  const [stream, setStream] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, l] = await Promise.all([api.from('tournament_settings').select('*').eq('tournament_id', tournamentId).maybeSingle(), api.rpc('list_sponsors', { p_tournament_id: tournamentId })]);
    setStream(((s.data as { stream_url?: string | null } | null)?.stream_url) ?? '');
    setRows((l.data ?? []) as unknown as Row[]);
  }, [tournamentId]);
  useEffect(() => { void load(); }, [load]);

  async function saveStream() {
    setBusy('stream'); setError(null); setOk(null);
    const { error: e } = await api.rpc('set_stream_url', { p_tournament_id: tournamentId, p_url: stream ?? '' });
    setBusy(null);
    if (e) return setError(e.message);
    setOk(stream?.trim() ? 'Stream link saved. "Watch live" now shows on the public pages.' : 'Stream link removed.');
  }

  async function saveSponsor() {
    setBusy('sponsor'); setError(null); setOk(null);
    const { error: e } = await api.rpc('save_sponsor', { p_tournament_id: tournamentId, p_id: form.id, p_name: form.name, p_website: form.website, p_tier: form.tier, p_logo_path: form.logo, p_order: Number(form.order) || 0 });
    setBusy(null);
    if (e) return setError(e.message);
    setForm(blank); setOk('Sponsor saved.');
    await load();
  }

  async function remove(row: Row) {
    const { error: e } = await api.rpc('delete_sponsor', { p_id: row.id });
    if (e) return setError(e.message);
    await load();
  }

  if (stream === null || !rows) return <Loading />;
  return (
    <View style={{ gap: 14 }}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{ok}</Text> : null}
      <View style={[portalCard(t), { gap: 12 }]}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Live stream</Text>
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>A stream link adds a "Watch live" button to the public pages.</Text>
        <Field label="Live stream link" value={stream} onChangeText={setStream} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://www.youtube.com/live/..." />
        <Button title="Save link" loading={busy === 'stream'} disabled={busy !== null} onPress={() => void saveStream()} />
      </View>

      <View style={[portalCard(t), { gap: 12 }]}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Sponsors</Text>
        {rows.length > 0 ? (
          <>
            <Sponsors sponsors={rows} />
            {rows.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 8 }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>{r.name} <Text style={{ color: t.textMuted, fontSize: 12 }}>{TIERS.find((x) => x.value === r.tier)?.label}</Text></Text>
                <Button tone="secondary" title="Edit" accessibilityLabel={`Edit ${r.name}`} onPress={() => setForm({ id: r.id, name: r.name, website: r.website ?? '', tier: r.tier, order: String(r.display_order), logo: null })} />
                <Button tone="danger-outline" title="Remove" accessibilityLabel={`Remove ${r.name}`} onPress={() => void remove(r)} />
              </View>
            ))}
          </>
        ) : <Text style={{ color: t.textSecondary, fontSize: 14 }}>No sponsors yet.</Text>}
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{form.id ? 'Edit sponsor' : 'Add a sponsor'}</Text>
        <Field label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} maxLength={80} />
        <Field label="Website (optional)" value={form.website} onChangeText={(v) => setForm({ ...form, website: v })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIERS.map((x) => <Button key={x.value} tone={form.tier === x.value ? 'primary' : 'secondary'} title={x.label} onPress={() => setForm({ ...form, tier: x.value })} />)}
        </View>
        <Field label="Order (smaller shows first)" value={form.order} onChangeText={(v) => setForm({ ...form, order: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" />
        <PhotoField bucket="logos" userId={tournamentId} label="Logo (optional)" path={form.logo} onChange={(p) => setForm({ ...form, logo: p })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {form.id ? <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setForm(blank)} /></View> : null}
          <View style={{ flex: 1 }}><Button title={form.id ? 'Save sponsor' : 'Add sponsor'} loading={busy === 'sponsor'} disabled={busy !== null || !form.name.trim()} onPress={() => void saveSponsor()} /></View>
        </View>
      </View>
    </View>
  );
}
