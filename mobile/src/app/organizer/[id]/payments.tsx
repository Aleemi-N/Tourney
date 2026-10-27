import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { PaymentLine } from '@/components/payment-settings';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { rupees, type Fees, type RegistrationPayment } from '@/lib/payments';
import { useTheme } from '@/theme';

/** Every registration payment of the tournament: who paid, how, and refunds. */
export default function OrganizerPayments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [rows, setRows] = useState<RegistrationPayment[] | null>(null);
  const [fees, setFees] = useState<{ player: number; team: number }>({ player: 0, team: 0 });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, f] = await Promise.all([api.rpc('list_registration_payments', { p_tournament_id: id }), api.rpc('get_registration_fees', { p_tournament_id: id })]);
    if (list.error) return setError(list.error.message);
    const v = f.data as Fees | null;
    setFees({ player: Number(v?.player_fee ?? 0), team: Number(v?.team_fee ?? 0) });
    // Payments waiting for the organizer's confirmation come first.
    setRows(((list.data ?? []) as unknown as RegistrationPayment[]).map((x) => ({ ...x, amount: Number(x.amount), refunded_amount: Number(x.refunded_amount) })).sort((a, b) => Number(b.status === 'SUBMITTED') - Number(a.status === 'SUBMITTED')));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const paid = (rows ?? []).filter((r) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(r.status));
  const collected = paid.reduce((sum, r) => sum + r.amount, 0);
  const refunded = paid.reduce((sum, r) => sum + r.refunded_amount, 0);
  const tile = (label: string, value: string) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 140, padding: 16, gap: 2 }]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>{value}</Text>
    </View>
  );

  return (
    <OrganizerFrame id={id} current="payments" title="Payments" subtitle={name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows ? (error ? null : <Loading />) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tile('Collected', rupees(collected))}
            {tile('Refunded', rupees(refunded))}
            {tile('Net', rupees(collected - refunded))}
          </View>
          {rows.some((r) => r.status === 'SUBMITTED') ? <Text accessibilityRole="alert" style={{ color: t.warning, fontSize: 14, fontWeight: '700' }}>{rows.filter((r) => r.status === 'SUBMITTED').length} UPI payment(s) waiting for you to confirm. Check your UPI app or bank, then tap Confirm received.</Text> : null}
          {fees.player <= 0 && fees.team <= 0 ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>Registration is free. Set fees in Settings, under Fees & Payments.</Text> : null}
          <Section title="Payments">
            {rows.length === 0 ? <Empty text="No payments yet." /> : rows.map((r) => (
              <View key={r.payment_id} style={[portalCard(t), { gap: 4 }]}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{r.label ?? 'Registration'}</Text>
                <Text style={{ color: t.textMuted, fontSize: 12 }}>{r.kind === 'TEAM' ? 'Team' : 'Player'}{r.paid_at ? ` · ${new Date(r.paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}{r.note ? ` · ${r.note}` : ''}</Text>
                <PaymentLine kind={r.kind} registrationId={r.registration_id} fee={r.kind === 'TEAM' ? fees.team || r.amount : fees.player || r.amount} payment={r} onChanged={load} />
              </View>
            ))}
          </Section>
        </>
      )}
    </OrganizerFrame>
  );
}
