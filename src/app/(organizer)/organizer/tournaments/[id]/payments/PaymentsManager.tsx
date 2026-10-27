'use client';

import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';
import { paymentsFetch, rupees, STATUS_LABEL } from '@/lib/payments-client';

type Row = { kind: 'PLAYER' | 'TEAM'; registration_id: string; payment_id: string; status: string; amount: number; provider: string; refunded_amount: number; paid_at: string | null; note: string | null; label: string | null; utr: string | null };

/** Every registration payment of the tournament, with refunds for online payments and a manual way to settle. */
export function PaymentsManager({ tournamentId }: { tournamentId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: e } = await callRpc('list_registration_payments', { p_tournament_id: tournamentId });
    if (e) return setError(e.message);
    // Payments waiting for the organizer's confirmation come first.
    setRows(((data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount), refunded_amount: Number(r.refunded_amount) })).sort((a, b) => Number(b.status === 'SUBMITTED') - Number(a.status === 'SUBMITTED')));
  }, [tournamentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void load();
  }, [load]);

  async function review(row: Row, accept: boolean) {
    setBusy(row.payment_id);
    setError(null);
    const { error: e } = await callRpc('review_upi_payment', { p_payment_id: row.payment_id, p_accept: accept });
    if (e) setError(e.message);
    else await load();
    setBusy(null);
  }

  async function refund(row: Row) {
    const byHand = row.provider !== 'RAZORPAY';
    const entered = window.prompt(`${byHand ? 'Send the money back from your own UPI app or in cash first, then record it here. ' : ''}Refund how much? Leave empty to refund everything left (${rupees(row.amount - row.refunded_amount)}).`, '');
    if (entered === null) return;
    setBusy(row.payment_id);
    setError(null);
    try {
      if (byHand) {
        const { error: e } = await callRpc('record_manual_refund', { p_payment_id: row.payment_id, p_amount: entered.trim() ? Number(entered) : null });
        if (e) throw new Error(e.message);
      } else await paymentsFetch(`/${row.payment_id}/refund`, { method: 'POST', body: entered.trim() ? { amount: Number(entered) } : {} });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refund.');
    }
    setBusy(null);
  }

  if (!rows) return <p className="text-text-secondary">{error ?? 'Loading…'}</p>;
  const paid = rows.filter((r) => ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(r.status));
  const collected = paid.reduce((s, r) => s + r.amount, 0);
  const refunded = paid.reduce((s, r) => s + r.refunded_amount, 0);
  const waiting = rows.filter((r) => r.status === 'SUBMITTED').length;
  return (
    <div className="space-y-6">
      {waiting > 0 ? <p role="status" className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm font-semibold text-text-primary">{waiting} UPI payment{waiting === 1 ? '' : 's'} waiting for you to confirm. Check your UPI app or bank for the reference number, then press Confirm received.</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Collected', collected], ['Refunded', refunded], ['Net', collected - refunded]].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
            <p className="mt-1 text-2xl font-black">{rupees(value as number)}</p>
          </div>
        ))}
      </div>
      {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-sm text-text-secondary">No payments yet. Set fees in Settings; players then pay online, or you mark them paid on the Players page.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
              <tr><th scope="col" className="px-4 py-3">Name</th><th scope="col" className="px-4 py-3">Type</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Amount</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.payment_id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-semibold">{r.label ?? 'Registration'}</td>
                  <td className="px-4 py-3 text-text-secondary">{r.kind === 'TEAM' ? 'Team' : 'Player'}</td>
                  <td className="px-4 py-3">{STATUS_LABEL[r.status] ?? r.status}{r.provider === 'MANUAL' && r.status === 'PAID' ? ' (offline)' : ''}{r.provider === 'UPI' && r.utr ? ` · UPI ref ${r.utr}` : ''}{r.refunded_amount > 0 ? ` · refunded ${rupees(r.refunded_amount)}` : ''}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{rupees(r.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'SUBMITTED' ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => void review(r, true)} disabled={busy === r.payment_id} aria-label={`Confirm ${r.label ?? 'payment'} was received`} className="min-h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Confirm received</button>
                        <button type="button" onClick={() => void review(r, false)} disabled={busy === r.payment_id} aria-label={`${r.label ?? 'Payment'} was not received`} className="min-h-9 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50">Not received</button>
                      </div>
                    ) : (r.status === 'PAID' || r.status === 'PARTIALLY_REFUNDED') && ['RAZORPAY', 'UPI', 'MANUAL'].includes(r.provider) ? (
                      <button type="button" onClick={() => void refund(r)} disabled={busy === r.payment_id} aria-label={`Refund ${r.label ?? 'payment'}`} className="min-h-9 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50">{r.provider === 'RAZORPAY' ? 'Refund' : 'Record refund'}</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
