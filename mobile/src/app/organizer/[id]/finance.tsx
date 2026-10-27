import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { shareCsv } from '@/lib/csv';
import { rupees } from '@/lib/payments';
import { useTheme } from '@/theme';

type Row = { source: 'ENTRY' | 'FEE' | 'REFUND'; id: string; kind: 'INCOME' | 'EXPENSE'; category: string; amount: number; occurred_on: string; description: string | null; party: string | null; has_attachment: boolean; voided: boolean; void_note: string | null };
type Summary = { income: number; expense: number; net: number; awaiting_confirmation: number; by_category: { kind: 'INCOME' | 'EXPENSE'; category: string; total: number }[] };

const CATEGORIES = {
  INCOME: ['Sponsorship', 'Donation', 'Merchandise', 'Food stall', 'Other income'],
  EXPENSE: ['Venue', 'Referees', 'Trophies & prizes', 'Balls & equipment', 'Food & water', 'Printing & branding', 'Travel', 'Medical', 'Streaming & media', 'Other expense'],
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = { id: null as string | null, kind: 'EXPENSE' as 'INCOME' | 'EXPENSE', category: '', amount: '', date: today(), description: '', party: '' };

/** Income and expense log of the tournament: totals, entries, adding and correcting, and a CSV export. */
export default function OrganizerFinance() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState<string | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([api.rpc('get_finance_ledger', { p_tournament_id: id }), api.rpc('get_finance_summary', { p_tournament_id: id })]);
    if (l.error || s.error) return setError((l.error ?? s.error)?.message ?? 'Could not load.');
    setRows(((l.data ?? []) as unknown as Row[]).map((r) => ({ ...r, amount: Number(r.amount) })));
    setSummary(s.data as unknown as Summary);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  function edit(row: Row) {
    setForm({ id: row.id, kind: row.kind, category: row.category, amount: String(row.amount), date: row.occurred_on, description: row.description ?? '', party: row.party ?? '' });
    setBill(null); setRemoveBill(false); setOpen(true);
  }

  async function attach() {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled) return;
    try {
      const out = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1000 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      setBill(out.base64 ?? null); setRemoveBill(false);
    } catch { setError('That image could not be used. Try another photo.'); }
  }

  async function save() {
    setBusy(true); setError(null);
    const { error: e } = await api.rpc('save_finance_entry', {
      p_tournament_id: id, p_id: form.id, p_kind: form.kind, p_category: form.category, p_amount: Number(form.amount), p_date: form.date,
      p_description: form.description, p_party: form.party, p_attachment: bill ?? undefined, p_remove_attachment: removeBill,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setForm(blank); setBill(null); setRemoveBill(false); setOpen(false);
    await load();
  }

  async function setVoid(row: Row, voided: boolean) {
    const { error: e } = await api.rpc('void_finance_entry', { p_id: row.id, p_void: voided });
    if (e) return setError(e.message);
    await load();
  }

  async function toggleBill(row: Row) {
    if (shown[row.id]) return setShown((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== row.id)));
    const { data, error: e } = await api.rpc('get_finance_attachment', { p_id: row.id });
    if (e) return setError(e.message);
    if (typeof data === 'string') setShown((s) => ({ ...s, [row.id]: data }));
  }

  const exportCsv = () => rows && shareCsv(`${(name || 'tournament').replace(/[^\w]+/g, '-')}-income-expenses.csv`, [
    ['Date', 'Type', 'Category', 'Description', 'Party', 'Income', 'Expense', 'Status'],
    ...rows.map((r) => [r.occurred_on, r.source === 'ENTRY' ? 'Entry' : r.source === 'FEE' ? 'Registration fee' : 'Refund', r.category, r.description, r.party, r.kind === 'INCOME' ? r.amount : '', r.kind === 'EXPENSE' ? r.amount : '', r.voided ? 'Voided' : '']),
  ]).catch((e) => setError(e instanceof Error ? e.message : 'Could not export.'));

  const tile = (label: string, value: number, color: string) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 130, padding: 16, gap: 2 }]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{rupees(value)}</Text>
    </View>
  );

  return (
    <OrganizerFrame id={id} current="finance" title="Income & expenses" subtitle={name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows || !summary ? (error ? null : <Loading />) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tile('Income', summary.income, t.success)}
            {tile('Expenses', summary.expense, t.danger)}
            {tile('Net', summary.net, summary.net < 0 ? t.danger : t.text)}
          </View>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>Registration fees that were paid and refunded appear here by themselves. Add everything else yourself. Entries are never deleted, only voided, and every change is logged.</Text>
          {summary.awaiting_confirmation > 0 ? <Text accessibilityRole="alert" style={{ color: t.warning, fontSize: 14, fontWeight: '700' }}>{rupees(summary.awaiting_confirmation)} in UPI payments waits for you to confirm on the Payments tab. It counts here once confirmed.</Text> : null}

          {summary.by_category.length > 0 ? (
            <Section title="By category">
              {summary.by_category.map((c) => (
                <View key={`${c.kind}-${c.category}`} style={[portalCard(t), { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }]}>
                  <Text style={{ color: t.text, fontSize: 14 }}>{c.category} <Text style={{ color: t.textMuted, fontSize: 12 }}>{c.kind === 'INCOME' ? 'income' : 'expense'}</Text></Text>
                  <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{rupees(c.total)}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title={open ? 'Close' : 'Add entry'} onPress={() => { setForm(blank); setBill(null); setRemoveBill(false); setOpen(!open); }} /></View>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Export CSV" onPress={() => void exportCsv()} /></View>
          </View>

          {open ? (
            <View style={[portalCard(t), { gap: 12 }]}>
              <Text accessibilityRole="header" style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{form.id ? 'Edit entry' : 'New entry'}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone={form.kind === 'EXPENSE' ? 'primary' : 'secondary'} title="Expense" onPress={() => setForm({ ...form, kind: 'EXPENSE' })} /></View>
                <View style={{ flex: 1 }}><Button tone={form.kind === 'INCOME' ? 'primary' : 'secondary'} title="Income" onPress={() => setForm({ ...form, kind: 'INCOME' })} /></View>
              </View>
              <Field label="Category" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} maxLength={40} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CATEGORIES[form.kind].map((c) => (
                  <Pressable key={c} accessibilityRole="button" accessibilityLabel={`Category ${c}`} onPress={() => setForm({ ...form, category: c })} style={{ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: form.category === c ? t.primary : t.border, backgroundColor: form.category === c ? t.primary + '22' : 'transparent' }}>
                    <Text style={{ color: form.category === c ? t.primary : t.textSecondary, fontSize: 13, fontWeight: '600' }}>{c}</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Amount (₹)" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" />
              <Field label="Date (YYYY-MM-DD)" value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} autoCapitalize="none" autoCorrect={false} placeholder="2026-10-28" />
              <Field label={form.kind === 'INCOME' ? 'Received from (optional)' : 'Paid to (optional)'} value={form.party} onChangeText={(v) => setForm({ ...form, party: v })} maxLength={100} />
              <Field label="Note (optional)" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} maxLength={200} />
              {bill ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={{ color: t.success, fontSize: 14, fontWeight: '600', flex: 1 }}>Photo of the bill attached</Text>
                  <Button tone="secondary" title="Remove" onPress={() => setBill(null)} />
                </View>
              ) : <Button tone="secondary" title="Attach a photo of the bill (optional)" accessibilityLabel="Attach a photo of the bill" onPress={() => void attach()} />}
              {form.id && !bill ? <Button tone={removeBill ? 'danger-outline' : 'secondary'} title={removeBill ? 'The saved photo will be removed' : 'Remove the saved photo'} onPress={() => setRemoveBill(!removeBill)} /> : null}
              <Button title={form.id ? 'Save changes' : 'Save entry'} loading={busy} disabled={busy || !form.category.trim() || !(Number(form.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)} onPress={() => void save()} />
            </View>
          ) : null}

          <Section title="Entries">
            {rows.length === 0 ? <Empty text="Nothing here yet. Add an entry for the first thing you earn or spend." /> : rows.map((r) => (
              <View key={`${r.source}-${r.id}`} style={[portalCard(t), { gap: 6, opacity: r.voided ? 0.6 : 1 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: '700', textDecorationLine: r.voided ? 'line-through' : 'none' }}>{r.category}{r.source !== 'ENTRY' ? '  ·  Automatic' : ''}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>{new Date(r.occurred_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <Text style={{ color: r.voided ? t.textMuted : r.kind === 'INCOME' ? t.success : t.danger, fontSize: 17, fontWeight: '800', textDecorationLine: r.voided ? 'line-through' : 'none' }}>{r.kind === 'INCOME' ? '+' : '−'}{rupees(r.amount)}</Text>
                </View>
                {[r.description, r.party].filter(Boolean).length ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>{[r.description, r.party].filter(Boolean).join(' · ')}</Text> : null}
                {r.voided ? <Text style={{ color: t.textMuted, fontSize: 12 }}>{r.void_note}</Text> : null}
                {shown[r.id] ? <Image accessibilityLabel="Photo of the bill" source={{ uri: shown[r.id] }} style={{ width: '100%', height: 320, borderRadius: 12, backgroundColor: t.surface }} resizeMode="contain" /> : null}
                {r.source === 'ENTRY' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {r.has_attachment ? <Button tone="secondary" title={shown[r.id] ? 'Hide bill' : 'Bill'} accessibilityLabel={`${shown[r.id] ? 'Hide' : 'View'} the bill for ${r.category}`} onPress={() => void toggleBill(r)} /> : null}
                    {!r.voided ? <Button tone="secondary" title="Edit" accessibilityLabel={`Edit ${r.category} entry`} onPress={() => edit(r)} /> : null}
                    <Button tone={r.voided ? 'secondary' : 'danger-outline'} title={r.voided ? 'Restore' : 'Void'} accessibilityLabel={`${r.voided ? 'Restore' : 'Void'} ${r.category} entry`} onPress={() => void setVoid(r, !r.voided)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Section>
        </>
      )}
    </OrganizerFrame>
  );
}
