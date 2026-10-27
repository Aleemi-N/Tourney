import { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Field } from '@/components/form';
import { ReceiptCard } from '@/components/payments';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { paymentsFetch, rupees, STATUS_LABEL, type Fees, type RegistrationPayment } from '@/lib/payments';
import { useTheme } from '@/theme';

type Account = { connected: boolean; mode?: 'test' | 'live'; keyId?: string; encryptionReady: boolean };

/** Registration fees and the organizer's Razorpay account, for the tournament settings. */
export function PaymentSettings({ tournamentId }: { tournamentId: string }) {
  const t = useTheme();
  const [fees, setFees] = useState<{ player: string; team: string } | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [upi, setUpi] = useState({ id: '', payee: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, a] = await Promise.all([
      api.rpc('get_registration_fees', { p_tournament_id: tournamentId }),
      paymentsFetch<Account>(`/tournaments/${tournamentId}/account`).catch(() => ({ connected: false, encryptionReady: false }) as Account),
    ]);
    const v = f.data as Fees | null;
    setFees({ player: v && Number(v.player_fee) > 0 ? String(Number(v.player_fee)) : '', team: v && Number(v.team_fee) > 0 ? String(Number(v.team_fee)) : '' });
    setUpi({ id: v?.upi_id ?? '', payee: v?.upi_payee ?? '' });
    setAccount(a);
  }, [tournamentId]);
  useEffect(() => { void load(); }, [load]);

  async function saveFees() {
    if (!fees) return;
    setBusy('fees'); setError(null); setOk(null);
    const player = fees.player.trim() === '' ? 0 : Number(fees.player);
    const team = fees.team.trim() === '' ? 0 : Number(fees.team);
    if (!Number.isFinite(player) || !Number.isFinite(team) || player < 0 || team < 0) { setBusy(null); return setError('Enter amounts in rupees, or leave a fee empty for free registration.'); }
    const { error: e } = await api.rpc('set_registration_fees', { p_tournament_id: tournamentId, p_player_fee: player, p_team_fee: team });
    setBusy(null);
    if (e) return setError(e.message);
    setOk(player || team ? 'Fees saved. New registrations will be asked to pay; approval waits for payment.' : 'Registration is free.');
    await load();
  }

  async function saveUpi() {
    setBusy('upi'); setError(null); setOk(null);
    const { error: e } = await api.rpc('set_upi_details', { p_tournament_id: tournamentId, p_upi_id: upi.id.trim(), p_payee: upi.payee.trim() });
    setBusy(null);
    if (e) return setError(e.message);
    setOk(upi.id.trim() ? 'UPI details saved. Players can now pay you by UPI.' : 'UPI payments are off.');
    await load();
  }

  async function connect() {
    setBusy('connect'); setError(null); setOk(null);
    try {
      const a = await paymentsFetch<Account>(`/tournaments/${tournamentId}/account`, { method: 'PUT', body: { keyId: keyId.trim(), keySecret: secret.trim() } });
      setAccount(a); setKeyId(''); setSecret('');
      setOk(`Razorpay connected in ${a.mode} mode.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect.'); }
    setBusy(null);
  }

  async function disconnect() {
    setBusy('disconnect'); setError(null); setOk(null);
    try { setAccount(await paymentsFetch<Account>(`/tournaments/${tournamentId}/account`, { method: 'DELETE' })); setOk('Razorpay disconnected. Fees are now collected offline.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not disconnect.'); }
    setBusy(null);
  }

  if (!fees || !account) return <Loading />;
  return (
    <View style={{ gap: 14 }}>
      <View style={[portalCard(t), { gap: 14 }]}>
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Registration fees</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>Optional. Leave a fee empty to keep that registration free. A registration with a fee cannot be approved until it is paid and you have confirmed it.</Text>
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{ok}</Text> : null}
        <Field label="Player fee (₹)" value={fees.player} onChangeText={(v) => setFees({ ...fees, player: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Free" />
        <Field label="Team fee (₹)" value={fees.team} onChangeText={(v) => setFees({ ...fees, team: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="Free" />
        <Button title="Save fees" loading={busy === 'fees'} disabled={busy !== null} onPress={() => void saveFees()} />
      </View>

      <View style={[portalCard(t), { gap: 12 }]}>
        <View style={{ gap: 2 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Get paid by UPI</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>The easy way, no account needed. Players pay your UPI ID from any UPI app, then enter the 12-digit reference number. You check your own UPI app or bank and tap Confirm received on the Players or Payments screen. Works for player and team fees. Leave empty to turn it off.</Text>
        </View>
        <Field label="Your UPI ID" value={upi.id} onChangeText={(v) => setUpi({ ...upi, id: v })} autoCapitalize="none" autoCorrect={false} placeholder="name@okhdfc" />
        <Field label="Name shown to players" value={upi.payee} onChangeText={(v) => setUpi({ ...upi, payee: v })} placeholder="Ravi Kumar" />
        <Button title="Save UPI details" loading={busy === 'upi'} disabled={busy !== null} onPress={() => void saveUpi()} />
      </View>

      <View style={[portalCard(t), { gap: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Card payments with Razorpay (optional)</Text>
          {account.connected ? <Pill label={account.mode === 'live' ? 'Razorpay · live' : 'Razorpay · test mode'} tone={account.mode === 'live' ? 'success' : 'neutral'} /> : <Pill label="Not connected" />}
        </View>
        {account.connected ? (
          <>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Players pay on Razorpay's page and the money goes straight to your Razorpay account ({account.keyId}). Tourny never holds it.{account.mode === 'test' ? ' Test mode moves no real money.' : ''}</Text>
            <Button tone="danger-outline" title="Disconnect Razorpay" loading={busy === 'disconnect'} disabled={busy !== null} onPress={() => void disconnect()} />
          </>
        ) : !account.encryptionReady ? (
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>Online payments are not switched on for this server yet. You can still charge a fee and mark registrations as paid yourself.</Text>
        ) : (
          <>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>To take payments online, connect your own Razorpay account: in the Razorpay dashboard open Account & Settings, then API Keys, and generate a key. Paste the Key ID and Key Secret here. Start with a test key to try it. Skip this if you use UPI or collect in cash.</Text>
            <Field label="Razorpay Key ID" value={keyId} onChangeText={setKeyId} autoCapitalize="none" autoCorrect={false} placeholder="rzp_test_..." />
            <Field label="Razorpay Key Secret" value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            <Button title="Connect Razorpay" loading={busy === 'connect'} disabled={busy !== null || !keyId.trim() || !secret.trim()} onPress={() => void connect()} />
          </>
        )}
      </View>
    </View>
  );
}

/** Payment status and the organizer's actions for one registration. Renders nothing when there is no fee. */
export function PaymentLine({ kind, registrationId, fee, payment, onChanged }: { kind: 'PLAYER' | 'TEAM'; registrationId: string; fee: number; payment: RegistrationPayment | undefined; onChanged: () => Promise<void> }) {
  const t = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  if (fee <= 0) return null;
  const status = payment?.status ?? 'DUE';
  const settled = ['PAID', 'WAIVED', 'PARTIALLY_REFUNDED'].includes(status);

  async function mark(kindOfMark: 'PAID' | 'WAIVED') {
    setBusy(kindOfMark); setError(null);
    const { error: e } = await api.rpc('mark_registration_paid', { p_kind: kind, p_registration_id: registrationId, p_status: kindOfMark });
    setBusy(null);
    if (e) return setError(e.message);
    await onChanged();
  }

  /** The payer's screenshot, shown only to the organizer (and the payer). */
  async function toggleProof() {
    if (!payment) return;
    if (proofUri) return setProofUri(null);
    setBusy('proof'); setError(null);
    const { data, error: e } = await api.rpc('get_payment_proof', { p_payment_id: payment.payment_id });
    setBusy(null);
    if (e) return setError(e.message);
    setProofUri(typeof data === 'string' ? data : null);
  }

  async function review(accept: boolean) {
    if (!payment) return;
    setBusy(accept ? 'accept' : 'reject'); setError(null);
    const { error: e } = await api.rpc('review_upi_payment', { p_payment_id: payment.payment_id, p_accept: accept });
    setBusy(null);
    if (e) return setError(e.message);
    await onChanged();
  }

  async function refund() {
    if (!payment) return;
    setBusy('refund'); setError(null);
    try {
      if (payment.provider === 'RAZORPAY') await paymentsFetch(`/${payment.payment_id}/refund`, { method: 'POST', body: refundAmount.trim() ? { amount: Number(refundAmount) } : {} });
      else {
        const { error: e } = await api.rpc('record_manual_refund', { p_payment_id: payment.payment_id, p_amount: refundAmount.trim() ? Number(refundAmount) : null });
        if (e) throw new Error(e.message);
      }
      setRefunding(false); setRefundAmount('');
      await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not refund.'); }
    setBusy(null);
  }

  const canRefund = !!payment && (status === 'PAID' || status === 'PARTIALLY_REFUNDED') && ['RAZORPAY', 'UPI', 'MANUAL'].includes(payment.provider);
  const byHand = payment?.provider !== 'RAZORPAY';
  return (
    <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: t.textSecondary, fontSize: 13 }}>Fee {rupees(fee)}{payment && payment.refunded_amount > 0 ? ` · refunded ${rupees(payment.refunded_amount)}` : ''}{payment?.provider === 'MANUAL' && status === 'PAID' ? ' · paid offline' : ''}{payment?.provider === 'UPI' && payment.utr ? ` · UPI ref ${payment.utr}` : ''}</Text>
        <Pill label={STATUS_LABEL[status] ?? status} tone={settled ? 'success' : 'neutral'} />
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {status === 'SUBMITTED' ? (
        <>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>The payer says they paid {rupees(payment?.amount ?? fee)} by UPI. Check your UPI app or bank for reference {payment?.utr} before confirming.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title="Confirm received" accessibilityLabel="Confirm the payment was received" loading={busy === 'accept'} disabled={busy !== null} onPress={() => void review(true)} /></View>
            <View style={{ flex: 1 }}><Button tone="danger-outline" title="Not received" loading={busy === 'reject'} disabled={busy !== null} onPress={() => void review(false)} /></View>
          </View>
        </>
      ) : null}
      {payment?.has_proof ? (
        <>
          <Button tone="secondary" title={proofUri ? 'Hide screenshot' : 'View screenshot'} accessibilityLabel="View the payer's screenshot" loading={busy === 'proof'} disabled={busy !== null} onPress={() => void toggleProof()} />
          {proofUri ? <Image accessibilityLabel="Screenshot of the payment" source={{ uri: proofUri }} style={{ width: '100%', height: 360, borderRadius: 12, backgroundColor: t.surface }} resizeMode="contain" /> : null}
        </>
      ) : null}
      {payment && ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(status) ? (
        <>
          <Button tone="secondary" title={receiptOpen ? 'Hide receipt' : 'View receipt'} accessibilityLabel="View the receipt" onPress={() => setReceiptOpen(!receiptOpen)} />
          {receiptOpen ? <ReceiptCard paymentId={payment.payment_id} /> : null}
        </>
      ) : null}
      {!settled && status !== 'SUBMITTED' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button tone="secondary" title="Mark paid" accessibilityLabel="Mark fee as paid" loading={busy === 'PAID'} disabled={busy !== null} onPress={() => void mark('PAID')} /></View>
          <View style={{ flex: 1 }}><Button tone="secondary" title="Waive fee" loading={busy === 'WAIVED'} disabled={busy !== null} onPress={() => void mark('WAIVED')} /></View>
        </View>
      ) : null}
      {canRefund && !refunding ? <Button tone="danger-outline" title={byHand ? 'Record a refund' : 'Refund'} accessibilityLabel="Refund this payment" onPress={() => setRefunding(true)} /> : null}
      {refunding ? (
        <View style={{ gap: 8 }}>
          {byHand ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>Send the money back from your own UPI app or in cash first, then record it here. Tourny cannot move this money for you.</Text> : null}
          <Field label="Refund amount (₹), empty for everything left" value={refundAmount} onChangeText={(v) => setRefundAmount(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setRefunding(false)} /></View>
            <View style={{ flex: 1 }}><Button tone="danger-outline" title={byHand ? 'Save refund' : 'Confirm refund'} loading={busy === 'refund'} disabled={busy !== null} onPress={() => void refund()} /></View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
