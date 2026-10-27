'use client';

import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';
import Link from 'next/link';
import { paymentsFetch, rupees, shrinkImage, upiLink } from '@/lib/payments-client';

type Due = { kind: 'PLAYER' | 'TEAM'; registration_id: string; tournament_id: string; tournament_name: string; label: string; amount: number; online: boolean; status: string; upi_id: string | null; upi_payee: string | null; utr: string | null; note: string | null; payment_id: string | null; has_proof: boolean };

const field = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';

/** A QR code for the UPI link, drawn in the browser (nothing is sent anywhere). */
function UpiQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void import('qrcode').then((m) => m.toDataURL(value, { margin: 1, width: 192 })).then((url) => { if (live) setSrc(url); }).catch(() => {});
    return () => { live = false; };
  }, [value]);
  // eslint-disable-next-line @next/next/no-img-element -- a generated data URL
  return src ? <img src={src} width={192} height={192} alt="QR code to pay with any UPI app" className="rounded-xl border border-border bg-white" /> : <div className="h-48 w-48 animate-pulse rounded-xl bg-surface-muted" />;
}

function DueCard({ due, reload }: { due: Due; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [utr, setUtr] = useState('');
  const [editingUtr, setEditingUtr] = useState(false);
  const [proof, setProof] = useState<{ name: string; data: string } | null>(null);

  async function submitUtr(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: e } = await callRpc('submit_upi_payment', { p_kind: due.kind, p_registration_id: due.registration_id, p_utr: utr, p_proof: proof?.data ?? null });
    setBusy(false);
    if (e) return setError(e.message);
    setUtr('');
    setProof(null);
    setEditingUtr(false);
    await reload();
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setProof({ name: file.name, data: await shrinkImage(file) });
    } catch {
      setError('That image could not be used. Try another screenshot.');
    }
  }

  const check = useCallback(async (quiet: boolean) => {
    setBusy(true);
    if (!quiet) setError(null);
    try {
      const r = await paymentsFetch<{ paid: boolean; status: string }>(`/status?kind=${due.kind}&registrationId=${due.registration_id}`);
      if (r.paid) await reload();
      else if (!quiet) setError(r.status === 'CREATED' ? 'The payment has not gone through yet.' : 'No payment found yet.');
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : 'Could not check the payment.');
    }
    setBusy(false);
  }, [due.kind, due.registration_id, reload]);

  // Returning from Razorpay's page: look at an open payment right away.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    if (due.status === 'CREATED') void check(true);
  }, [due.status, check]);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const r = await paymentsFetch<{ shortUrl: string }>('/pay', { method: 'POST', body: { kind: due.kind, registrationId: due.registration_id } });
      window.location.assign(r.shortUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment.');
      setBusy(false);
    }
  }

  return (
    <article className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">{due.label}</h3>
          <p className="text-sm text-text-muted">{due.kind === 'TEAM' ? 'Team registration' : 'Player registration'} · {due.tournament_name}</p>
        </div>
        <p className="text-xl font-black">{rupees(due.amount)}</p>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p> : null}
      {due.online ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void pay()} disabled={busy} aria-label={`Pay ${rupees(due.amount)} for ${due.label}`} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Pay {rupees(due.amount)}</button>
          {due.status === 'CREATED' ? <button type="button" onClick={() => void check(false)} disabled={busy} className="min-h-11 rounded-xl border border-border-strong px-4 font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50">I have paid: check now</button> : null}
          <p className="w-full text-xs text-text-muted">You pay on Razorpay&apos;s secure page. Your registration can be approved once the payment is confirmed.</p>
        </div>
      ) : !due.upi_id ? (
        <p className="mt-3 text-sm text-text-secondary">The organizer collects this fee directly. Pay them and they will mark your registration as paid.</p>
      ) : null}
      {due.status === 'REJECTED' ? <p role="status" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">The organizer did not receive this payment{due.note ? `: ${due.note}` : '.'} Check the reference number and send it again.</p> : null}
      {due.upi_id ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {due.online ? <p className="text-sm font-semibold text-text-secondary">Or pay by UPI</p> : null}
          {due.status === 'SUBMITTED' && !editingUtr ? (
            <>
              <p className="rounded-xl bg-warning/10 px-3 py-2 text-sm font-medium text-text-primary" role="status">Waiting for the organizer to confirm. You said you paid, reference <span className="font-mono">{due.utr}</span>{due.has_proof ? ' (screenshot attached)' : ''}. Your registration can be approved after that.</p>
              <button type="button" onClick={() => { setUtr(due.utr ?? ''); setEditingUtr(true); }} className="min-h-11 rounded-xl border border-border-strong px-4 font-semibold text-text-secondary hover:bg-surface-muted">Change the reference number</button>
            </>
          ) : (
            <div className="flex flex-wrap items-start gap-5">
              <UpiQr value={upiLink(due.upi_id, due.upi_payee, due.amount, `${due.tournament_name} ${due.label}`)} />
              <div className="min-w-[14rem] flex-1 space-y-3">
                <p className="text-sm text-text-secondary">Scan with any UPI app, or pay to <span className="font-mono font-semibold text-text-primary">{due.upi_id}</span>{due.upi_payee ? ` (${due.upi_payee})` : ''}. The money goes straight to the organizer.</p>
                <a href={upiLink(due.upi_id, due.upi_payee, due.amount, `${due.tournament_name} ${due.label}`)} className="inline-flex min-h-11 items-center rounded-xl border border-border-strong px-4 font-semibold text-text-secondary hover:bg-surface-muted md:hidden">Open my UPI app</a>
                <form onSubmit={submitUtr} className="space-y-3">
                  <label className="block text-sm font-medium text-text-primary">UPI reference number (12 digits, shown in your UPI app after paying)
                    <input inputMode="numeric" value={utr} onChange={(e) => setUtr(e.target.value.replace(/[^0-9 ]/g, ''))} maxLength={14} placeholder="4021 0000 0001" className={field} />
                  </label>
                  <div>
                    <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-strong px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted focus-within:ring-2 focus-within:ring-primary/40">
                      {proof ? `Screenshot: ${proof.name}` : 'Attach a screenshot (optional)'}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Attach a screenshot of the payment" onChange={(e) => void attach(e.target.files?.[0])} />
                    </label>
                    {proof ? <button type="button" onClick={() => setProof(null)} className="ml-2 min-h-11 px-2 text-sm font-semibold text-danger">Remove</button> : null}
                  </div>
                  <button disabled={busy || utr.replace(/\s/g, '').length !== 12} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">I have paid</button>
                </form>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

type ReceiptItem = { payment_id: string; tournament_name: string; label: string | null; amount: number; refunded_amount: number; status: string; paid_at: string | null };

/** Receipts for the fees the signed-in user has paid. Renders nothing when there are none. */
export function PaymentReceipts() {
  const [items, setItems] = useState<ReceiptItem[] | null>(null);
  useEffect(() => {
    void callRpc('my_payment_receipts', {}).then(({ data }) => setItems(((data ?? []) as ReceiptItem[]).map((r) => ({ ...r, amount: Number(r.amount) }))));
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">Receipts</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((r) => (
          <article key={r.payment_id} className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-5">
            <div>
              <h3 className="font-black">{r.label ?? 'Registration'}</h3>
              <p className="text-sm text-text-muted">{r.tournament_name}{r.paid_at ? ` · ${new Date(r.paid_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>
            </div>
            <div className="text-right">
              <p className="font-black">{rupees(r.amount)}</p>
              <Link href={`/pay/receipt/${r.payment_id}`} aria-label={`Receipt for ${r.label ?? 'registration'}`} className="text-sm font-semibold text-primary hover:underline">Receipt</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** The registration fees the signed-in user still owes. Renders nothing when nothing is owed. */
export function PaymentsDue({ title = 'Payments due' }: { title?: string }) {
  const [items, setItems] = useState<Due[] | null>(null);
  const reload = useCallback(async () => {
    const { data } = await callRpc('my_payments_due', {});
    setItems(((data ?? []) as Due[]).map((d) => ({ ...d, amount: Number(d.amount) })));
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void reload();
  }, [reload]);
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">{title}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((d) => <DueCard key={`${d.kind}-${d.registration_id}`} due={d} reload={reload} />)}</div>
    </section>
  );
}
