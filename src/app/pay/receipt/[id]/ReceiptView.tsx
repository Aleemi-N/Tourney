'use client';

import { useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';
import { rupees } from '@/lib/payments-client';

type Receipt = { receipt_no: string; tournament: string; name: string | null; kind: 'PLAYER' | 'TEAM'; amount: number; refunded_amount: number; method: string; reference: string | null; paid_at: string | null; paid_to: string | null };

/** A registration fee receipt that can be printed or saved as a PDF from the browser. */
export function ReceiptView({ paymentId }: { paymentId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void callRpc('get_payment_receipt', { p_payment_id: paymentId }).then(({ data, error: e }) => {
      if (e) setError(e.message);
      else setReceipt(data as Receipt);
    });
  }, [paymentId]);

  if (error) return <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-danger">{error === 'Receipt not found' ? 'This receipt was not found. Sign in with the account that paid, or as the organizer.' : error}</p>;
  if (!receipt) return <div className="h-64 animate-pulse rounded-3xl border border-border bg-surface" />;
  const rows: [string, string | null][] = [
    ['Receipt no.', receipt.receipt_no],
    ['Tournament', receipt.tournament],
    [receipt.kind === 'TEAM' ? 'Team' : 'Player', receipt.name],
    ['Paid by', receipt.method],
    ['Reference', receipt.reference],
    ['Paid to', receipt.paid_to],
    ['Date', receipt.paid_at ? new Date(receipt.paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null],
    ['Refunded', Number(receipt.refunded_amount) > 0 ? rupees(receipt.refunded_amount) : null],
  ];
  return (
    <div>
      <article className="rounded-3xl border border-border bg-surface p-6 print:border-0 print:p-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">Registration fee receipt</p>
        <p className="mt-2 text-4xl font-black">{rupees(receipt.amount)}</p>
        <dl className="mt-6 space-y-3">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 text-sm"><dt className="text-text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
          ))}
        </dl>
      </article>
      <div className="mt-6 flex gap-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover">Print or save as PDF</button>
        <button type="button" onClick={() => window.history.back()} className="min-h-11 rounded-xl border border-border-strong px-5 font-semibold text-text-secondary hover:bg-surface-muted">Back</button>
      </div>
    </div>
  );
}
