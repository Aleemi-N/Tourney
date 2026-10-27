'use client';

import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';
import { downloadCsv } from '@/lib/csv';
import { rupees, shrinkImage } from '@/lib/payments-client';

type Row = { source: 'ENTRY' | 'FEE' | 'REFUND'; id: string; kind: 'INCOME' | 'EXPENSE'; category: string; amount: number; occurred_on: string; description: string | null; party: string | null; has_attachment: boolean; voided: boolean; void_note: string | null; created_by_name: string | null };
type Summary = { income: number; expense: number; net: number; fees_collected: number; refunds: number; awaiting_confirmation: number; by_category: { kind: 'INCOME' | 'EXPENSE'; category: string; total: number }[] };

const CATEGORIES = {
  INCOME: ['Sponsorship', 'Donation', 'Merchandise', 'Food stall', 'Other income'],
  EXPENSE: ['Venue', 'Referees', 'Trophies & prizes', 'Balls & equipment', 'Food & water', 'Printing & branding', 'Travel', 'Medical', 'Streaming & media', 'Other expense'],
};
const input = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';
const today = () => new Date().toISOString().slice(0, 10);
const blank = { id: null as string | null, kind: 'EXPENSE' as 'INCOME' | 'EXPENSE', category: '', amount: '', date: today(), description: '', party: '' };

/** The tournament's income and expense log: totals, the entries, adding and correcting, and a CSV export. */
export function FinanceManager({ tournamentId, tournamentName }: { tournamentId: string; tournamentName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState<{ name: string; data: string } | null>(null);
  const [removeBill, setRemoveBill] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [l, s] = await Promise.all([callRpc('get_finance_ledger', { p_tournament_id: tournamentId }), callRpc('get_finance_summary', { p_tournament_id: tournamentId })]);
    if (l.error || s.error) return setError((l.error ?? s.error)?.message ?? 'Could not load.');
    setRows(((l.data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount) })));
    setSummary(s.data as Summary);
  }, [tournamentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void load();
  }, [load]);

  function edit(row: Row) {
    setForm({ id: row.id, kind: row.kind, category: row.category, amount: String(row.amount), date: row.occurred_on, description: row.description ?? '', party: row.party ?? '' });
    setBill(null);
    setRemoveBill(false);
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: e } = await callRpc('save_finance_entry', {
      p_tournament_id: tournamentId, p_id: form.id, p_kind: form.kind, p_category: form.category, p_amount: Number(form.amount), p_date: form.date,
      p_description: form.description, p_party: form.party, p_attachment: bill?.data ?? null, p_remove_attachment: removeBill,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setForm(blank);
    setBill(null);
    setRemoveBill(false);
    setOpen(false);
    await load();
  }

  async function voidEntry(row: Row, voided: boolean) {
    const reason = voided ? window.prompt('Why are you voiding this entry? (optional)', '') : '';
    if (reason === null) return;
    const { error: e } = await callRpc('void_finance_entry', { p_id: row.id, p_void: voided, p_reason: reason });
    if (e) return setError(e.message);
    await load();
  }

  async function toggleBill(row: Row) {
    if (shown[row.id]) return setShown((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== row.id)));
    const { data, error: e } = await callRpc('get_finance_attachment', { p_id: row.id });
    if (e) return setError(e.message);
    if (typeof data === 'string') setShown((s) => ({ ...s, [row.id]: data }));
  }

  function exportCsv() {
    if (!rows) return;
    downloadCsv(`${tournamentName.replace(/[^\w]+/g, '-')}-income-expenses.csv`, [
      ['Date', 'Type', 'Category', 'Description', 'Party', 'Income', 'Expense', 'Status'],
      ...rows.map((r) => [r.occurred_on, r.source === 'ENTRY' ? 'Entry' : r.source === 'FEE' ? 'Registration fee' : 'Refund', r.category, r.description, r.party, r.kind === 'INCOME' ? r.amount : '', r.kind === 'EXPENSE' ? r.amount : '', r.voided ? 'Voided' : '']),
    ]);
  }

  if (!rows || !summary) return <p className="text-text-secondary">{error ?? 'Loading…'}</p>;
  return (
    <div className="space-y-8">
      {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Income', summary.income, 'text-success'], ['Expenses', summary.expense, 'text-danger'], ['Net', summary.net, summary.net < 0 ? 'text-danger' : 'text-text-primary']].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{rupees(value as number)}</p>
          </div>
        ))}
      </div>
      {summary.awaiting_confirmation > 0 ? <p role="status" className="rounded-xl bg-warning/10 px-3 py-2.5 text-sm font-semibold">{rupees(summary.awaiting_confirmation)} in UPI payments is waiting for you to confirm on the Payments page. It is counted here once confirmed.</p> : null}

      {summary.by_category.length > 0 ? (
        <section aria-labelledby="by-category">
          <h2 id="by-category" className="text-sm font-bold uppercase tracking-wider text-text-muted">By category</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {summary.by_category.map((c) => (
              <li key={`${c.kind}-${c.category}`} className="flex justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"><span>{c.category}<span className="ml-2 text-xs text-text-muted">{c.kind === 'INCOME' ? 'income' : 'expense'}</span></span><span className="font-semibold tabular-nums">{rupees(c.total)}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="entries" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="entries" className="text-lg font-black">Entries</h2>
          <div className="flex gap-2">
            <button type="button" onClick={exportCsv} className="min-h-11 rounded-xl border border-border-strong px-4 font-semibold text-text-secondary hover:bg-surface-muted">Export CSV</button>
            <button type="button" onClick={() => { setForm(blank); setBill(null); setRemoveBill(false); setOpen(!open); }} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover">{open ? 'Close' : 'Add entry'}</button>
          </div>
        </div>

        {open ? (
          <form onSubmit={save} className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2" aria-label={form.id ? 'Edit entry' : 'New entry'}>
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-text-primary">Type</legend>
              <div className="mt-1.5 flex gap-2">
                {(['EXPENSE', 'INCOME'] as const).map((k) => (
                  <label key={k} className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-4 text-sm font-semibold ${form.kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary'}`}>
                    <input type="radio" name="kind" value={k} checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} className="sr-only" />{k === 'EXPENSE' ? 'Expense' : 'Income'}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="text-sm font-medium text-text-primary">Category
              <input list="finance-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required maxLength={40} className={input} />
              <datalist id="finance-categories">{CATEGORIES[form.kind].map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="text-sm font-medium text-text-primary">Amount (₹)
              <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, '') })} required className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary">Date
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary">{form.kind === 'INCOME' ? 'Received from' : 'Paid to'} (optional)
              <input value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} maxLength={100} className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary sm:col-span-2">Note (optional)
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} className={input} />
            </label>
            <div className="sm:col-span-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-strong px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted focus-within:ring-2 focus-within:ring-primary/40">
                {bill ? `Photo: ${bill.name}` : 'Attach a photo of the bill (optional)'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Attach a photo of the bill" onChange={(e) => { const f = e.target.files?.[0]; if (f) void shrinkImage(f).then((data) => { setBill({ name: f.name, data }); setRemoveBill(false); }).catch(() => setError('That image could not be used.')); }} />
              </label>
              {form.id && !bill ? <label className="ml-3 text-sm text-text-secondary"><input type="checkbox" checked={removeBill} onChange={(e) => setRemoveBill(e.target.checked)} className="mr-2" />Remove the saved photo</label> : null}
            </div>
            <div className="sm:col-span-2">
              <button disabled={busy} className="min-h-11 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{form.id ? 'Save changes' : 'Save entry'}</button>
            </div>
          </form>
        ) : null}

        {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-sm text-text-secondary">Nothing here yet. Add an entry for the first thing you earn or spend.</p> : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <tr><th scope="col" className="px-4 py-3">Date</th><th scope="col" className="px-4 py-3">Details</th><th scope="col" className="px-4 py-3 text-right">Amount</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.source}-${r.id}`} className={`border-b border-border align-top last:border-b-0 ${r.voided ? 'text-text-muted line-through' : ''}`}>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{new Date(r.occurred_on + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{r.category}{r.source !== 'ENTRY' ? <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs font-medium no-underline">Automatic</span> : null}</p>
                      <p className="text-text-secondary">{[r.description, r.party].filter(Boolean).join(' · ')}</p>
                      {r.voided ? <p className="text-xs no-underline">{r.void_note}</p> : null}
                      {shown[r.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a private data URL from the database
                        <img src={shown[r.id]} alt="Photo of the bill" className="mt-2 max-h-64 rounded-xl border border-border" />
                      ) : null}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${r.voided ? '' : r.kind === 'INCOME' ? 'text-success' : 'text-danger'}`}>{r.kind === 'INCOME' ? '+' : '−'}{rupees(r.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold">
                      {r.source === 'ENTRY' ? (
                        <div className="flex justify-end gap-3 no-underline">
                          {r.has_attachment ? <button type="button" onClick={() => void toggleBill(r)} className="min-h-9 text-primary hover:underline" aria-label={`${shown[r.id] ? 'Hide' : 'View'} the bill for ${r.category}`}>{shown[r.id] ? 'Hide bill' : 'Bill'}</button> : null}
                          {!r.voided ? <button type="button" onClick={() => edit(r)} className="min-h-9 text-primary hover:underline" aria-label={`Edit ${r.category} entry`}>Edit</button> : null}
                          <button type="button" onClick={() => void voidEntry(r, !r.voided)} className="min-h-9 text-danger hover:underline" aria-label={`${r.voided ? 'Restore' : 'Void'} ${r.category} entry`}>{r.voided ? 'Restore' : 'Void'}</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
