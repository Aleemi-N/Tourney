import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { Field } from '@/components/form';
import { paymentsFetch, rupees, upiLink, type PaymentDue, type PaymentReceipt, type ReceiptListItem } from '@/lib/payments';
import { shareView, type ViewHandle } from '@/lib/share';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

/** The registration fees the signed-in user still owes (optionally only for one tournament). */
export function usePaymentsDue(tournamentId?: string) {
  const { session } = useAuth();
  const [items, setItems] = useState<PaymentDue[] | null>(null);
  const reload = useCallback(async () => {
    if (!session) return setItems([]);
    const { data } = await api.rpc('my_payments_due');
    const all = ((data ?? []) as unknown as PaymentDue[]).map((d) => ({ ...d, amount: Number(d.amount) }));
    setItems(tournamentId ? all.filter((d) => d.tournament_id === tournamentId) : all);
  }, [session, tournamentId]);
  useEffect(() => { void reload(); }, [reload]);
  // Coming back from the payment page: look again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void reload(); });
    return () => sub.remove();
  }, [reload]);
  return { items, reload };
}

/** One fee to pay: the amount, a button that opens Razorpay's payment page, and a way to check the result. */
function DueCard({ due, reload }: { due: PaymentDue; reload: () => Promise<void> }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [utr, setUtr] = useState('');
  const [editingUtr, setEditingUtr] = useState(false);
  const [proof, setProof] = useState<string | null>(null);

  async function openUpi() {
    if (!due.upi_id) return;
    setError(null);
    try { await Linking.openURL(upiLink(due.upi_id, due.upi_payee, due.amount, `${due.tournament_name} ${due.label}`)); }
    catch { setError(`No UPI app opened. Pay ${rupees(due.amount)} to ${due.upi_id} in your UPI app, then enter the reference number below.`); }
  }

  /** A screenshot of the payment is optional. It is shrunk first so it stays small to send. */
  async function attachProof() {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (picked.canceled) return;
    try {
      const out = await ImageManipulator.manipulateAsync(picked.assets[0].uri, [{ resize: { width: 1000 } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      setProof(out.base64 ?? null);
    } catch { setError('That image could not be used. Try another screenshot.'); }
  }

  async function submitUtr() {
    setBusy(true); setError(null);
    const { error: e } = await api.rpc('submit_upi_payment', { p_kind: due.kind, p_registration_id: due.registration_id, p_utr: utr, p_proof: proof ?? undefined });
    setBusy(false);
    if (e) return setError(e.message);
    setUtr(''); setProof(null); setEditingUtr(false);
    await reload();
  }

  async function pay() {
    setBusy(true); setError(null);
    try {
      const r = await paymentsFetch<{ shortUrl: string }>('/pay', { method: 'POST', body: { kind: due.kind, registrationId: due.registration_id } });
      setOpened(true);
      await Linking.openURL(r.shortUrl);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the payment.'); }
    setBusy(false);
  }

  async function check(quiet = false) {
    setBusy(true); setError(null);
    try {
      const r = await paymentsFetch<{ paid: boolean; status: string }>(`/status?kind=${due.kind}&registrationId=${due.registration_id}`);
      if (!r.paid && !quiet) setError(r.status === 'CREATED' ? 'The payment has not gone through yet.' : 'No payment found yet.');
      if (r.paid) await reload();
    } catch (e) { if (!quiet) setError(e instanceof Error ? e.message : 'Could not check the payment.'); }
    setBusy(false);
  }
  // Back from Razorpay's page (or reopening the app): look at an open payment right away.
  useEffect(() => { if (due.status === 'CREATED') void check(true); }, [due.status, due.registration_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[portalCard(t), { gap: 10 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{due.label}</Text>
          <Text style={{ color: t.textMuted, fontSize: 13 }}>{due.kind === 'TEAM' ? 'Team registration' : 'Player registration'} · {due.tournament_name}</Text>
        </View>
        <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{rupees(due.amount)}</Text>
      </View>
      {due.status === 'SUBMITTED' ? <StatusPill tone="warning" label="Waiting for organizer to confirm" /> : due.status === 'REJECTED' ? <StatusPill tone="danger" label="Payment not received" /> : <StatusPill tone="warning" label={due.status === 'CREATED' ? 'Waiting for payment' : 'Payment due'} />}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {due.status === 'REJECTED' && due.note ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>The organizer says: {due.note}</Text> : null}
      {due.online ? (
        <>
          <Button title={`Pay ${rupees(due.amount)}`} accessibilityLabel={`Pay ${rupees(due.amount)} for ${due.label}`} loading={busy && !opened} disabled={busy} onPress={() => void pay()} />
          {opened || due.status === 'CREATED' ? <Button tone="secondary" title="I have paid: check now" disabled={busy} onPress={() => void check()} /> : null}
          <Text style={{ color: t.textMuted, fontSize: 12 }}>You pay on Razorpay's secure page. Your registration can be approved once the payment is confirmed.</Text>
        </>
      ) : !due.upi_id ? (
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>The organizer collects this fee directly. Pay them and they will mark your registration as paid.</Text>
      ) : null}
      {due.upi_id ? (
        <View style={{ gap: 8 }}>
          {due.online ? <Text style={{ color: t.textMuted, fontSize: 13 }}>Or pay by UPI</Text> : null}
          {due.status === 'SUBMITTED' && !editingUtr ? (
            <>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>You said you paid, reference {due.utr}{due.has_proof ? ' (screenshot attached)' : ''}. The organizer will check and confirm. Your registration can be approved after that.</Text>
              <Button tone="secondary" title="Change the reference number" onPress={() => { setUtr(due.utr ?? ''); setEditingUtr(true); }} />
            </>
          ) : (
            <>
              <Button tone={due.online ? 'secondary' : 'primary'} title={`Pay ${rupees(due.amount)} by UPI`} accessibilityLabel={`Pay ${rupees(due.amount)} by UPI to ${due.upi_payee ?? due.upi_id}`} disabled={busy} onPress={() => void openUpi()} />
              <Text selectable style={{ color: t.textSecondary, fontSize: 13 }}>UPI ID: {due.upi_id}{due.upi_payee ? ` (${due.upi_payee})` : ''}. The money goes straight to the organizer.</Text>
              <Field label="UPI reference number (12 digits, shown in your UPI app after paying)" value={utr} onChangeText={(v) => setUtr(v.replace(/[^0-9 ]/g, ''))} keyboardType="number-pad" maxLength={14} placeholder="4021 0000 0001" />
              {proof ? (
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <Text style={{ color: t.success, fontSize: 14, fontWeight: '600', flex: 1 }}>Screenshot attached</Text>
                  <Button tone="secondary" title="Remove" onPress={() => setProof(null)} />
                </View>
              ) : <Button tone="secondary" title="Attach a screenshot (optional)" accessibilityLabel="Attach a screenshot of the payment" disabled={busy} onPress={() => void attachProof()} />}
              <Button title="I have paid" loading={busy} disabled={busy || utr.replace(/\s/g, '').length !== 12} onPress={() => void submitUtr()} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** A receipt for one confirmed payment, with a button that shares it as a picture (WhatsApp and the rest). */
export function ReceiptCard({ paymentId }: { paymentId: string }) {
  const t = useTheme();
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const card = useRef<ViewHandle>(null);
  useEffect(() => {
    api.rpc('get_payment_receipt', { p_payment_id: paymentId }).then(({ data, error: e }) => {
      if (e) setError(e.message); else setReceipt(data as unknown as PaymentReceipt);
    });
  }, [paymentId]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!receipt) return null;
  const row = (label: string, value: string | null | undefined) => value ? (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  ) : null;
  return (
    <View style={{ gap: 10 }}>
      <View ref={card} collapsable={false} style={[portalCard(t), { gap: 8, backgroundColor: t.surface }]}>
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>Registration fee receipt</Text>
        <Text style={{ color: t.text, fontSize: 26, fontWeight: '800' }}>{rupees(receipt.amount)}</Text>
        {row('Receipt no.', receipt.receipt_no)}
        {row('Tournament', receipt.tournament)}
        {row(receipt.kind === 'TEAM' ? 'Team' : 'Player', receipt.name)}
        {row('Paid by', receipt.method)}
        {row('Reference', receipt.reference)}
        {row('Paid to', receipt.paid_to)}
        {row('Date', receipt.paid_at ? new Date(receipt.paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null)}
        {receipt.refunded_amount > 0 ? row('Refunded', rupees(receipt.refunded_amount)) : null}
      </View>
      <Button tone="secondary" title="Share receipt" onPress={() => void shareView(card.current, `receipt-${receipt.receipt_no}.png`, 'Registration fee receipt').catch((e) => setError(e instanceof Error ? e.message : 'Could not share.'))} />
    </View>
  );
}

/** Receipts for the fees the signed-in user has paid. Renders nothing when there are none. */
export function PaymentReceipts() {
  const t = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<ReceiptListItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    api.rpc('my_payment_receipts').then(({ data }) => setItems(((data ?? []) as unknown as ReceiptListItem[]).map((r) => ({ ...r, amount: Number(r.amount), refunded_amount: Number(r.refunded_amount) }))));
  }, [session]);
  if (!items || items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Receipts</Text>
      {items.map((r) => (
        <View key={r.payment_id} style={[portalCard(t), { gap: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{r.label ?? 'Registration'}</Text>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>{r.tournament_name}{r.paid_at ? ` · ${new Date(r.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</Text>
            </View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{rupees(r.amount)}</Text>
          </View>
          <Button tone="secondary" title={open === r.payment_id ? 'Hide receipt' : 'View receipt'} accessibilityLabel={`${open === r.payment_id ? 'Hide' : 'View'} receipt for ${r.label ?? 'registration'}`} onPress={() => setOpen(open === r.payment_id ? null : r.payment_id)} />
          {open === r.payment_id ? <ReceiptCard paymentId={r.payment_id} /> : null}
        </View>
      ))}
    </View>
  );
}

/** A list of fees to pay. Renders nothing when nothing is owed. */
export function PaymentsDue({ tournamentId, title = 'Payments due' }: { tournamentId?: string; title?: string }) {
  const t = useTheme();
  const { items, reload } = usePaymentsDue(tournamentId);
  if (!items || items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      {items.map((d) => <DueCard key={`${d.kind}-${d.registration_id}`} due={d} reload={reload} />)}
    </View>
  );
}

/** "Registration fee: ₹250" for a tournament, shown before registering. Renders nothing for a free tournament. */
export function FeeNotice({ tournamentId, kind }: { tournamentId: string; kind: 'PLAYER' | 'TEAM' }) {
  const t = useTheme();
  const [fee, setFee] = useState<{ amount: number; online: boolean; upi: boolean } | null>(null);
  useEffect(() => {
    api.rpc('get_registration_fees', { p_tournament_id: tournamentId }).then(({ data }) => {
      const f = data as { player_fee: number; team_fee: number; online: boolean; upi: boolean } | null;
      const amount = Number(kind === 'PLAYER' ? f?.player_fee : f?.team_fee);
      setFee(f && amount > 0 ? { amount, online: f.online, upi: f.upi } : null);
    });
  }, [tournamentId, kind]);
  if (!fee) return null;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 14, gap: 4 }}>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Registration fee: {rupees(fee.amount)}</Text>
      <Text style={{ color: t.textSecondary, fontSize: 13 }}>{fee.online || fee.upi ? `You can pay ${fee.online ? 'online' : 'by UPI'} right after you register. Your registration is approved once the fee is paid.` : 'The organizer collects this fee directly and marks you as paid.'}</Text>
    </View>
  );
}
