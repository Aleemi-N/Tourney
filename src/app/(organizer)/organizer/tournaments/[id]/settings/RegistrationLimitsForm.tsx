'use client';

import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';

type Status = { closes_at: string | null; timezone: string; max_players: number | null; players_approved: number; waitlist: number; born_on_or_after: string | null; born_on_or_before: string | null };

const input = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';
const pad = (n: number) => String(n).padStart(2, '0');
/** The value a datetime-local input wants, in this browser's time. */
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** Registration deadline, player limit with waitlist, and age category. */
export function RegistrationLimitsForm({ tournamentId }: { tournamentId: string }) {
  const [form, setForm] = useState<{ closes: string; max: string; after: string; before: string } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await callRpc('get_registration_status', { p_tournament_id: tournamentId });
    const s = data as Status | null;
    setStatus(s);
    setForm({ closes: toLocal(s?.closes_at ?? null), max: s?.max_players ? String(s.max_players) : '', after: s?.born_on_or_after ?? '', before: s?.born_on_or_before ?? '' });
  }, [tournamentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void load();
  }, [load]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    setMessage(null);
    const { error } = await callRpc('set_registration_limits', {
      p_tournament_id: tournamentId, p_closes_at: form.closes ? new Date(form.closes).toISOString() : null, p_max_players: form.max.trim() ? Number(form.max) : null,
      p_born_after: form.after || null, p_born_before: form.before || null,
    });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    setMessage({ ok: true, text: 'Registration limits saved.' });
    await load();
  }

  if (!form) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-labelledby="limits-heading">
      <div className="border-b border-border px-4 py-5 sm:px-6">
        <h2 id="limits-heading" className="text-lg font-semibold text-text-primary">Registration limits &amp; age category</h2>
        <p className="mt-1 text-sm text-text-secondary">All optional; leave a field empty for no limit. Registration stops at the deadline. When the player limit is reached, new players join a waitlist and move up as you approve or remove people or raise the limit. Teams use the team limit in the tournament rules.</p>
        {status ? <p className="mt-2 text-sm text-text-muted">{status.players_approved} players approved{status.max_players ? ` of ${status.max_players}` : ''}{status.waitlist ? ` · ${status.waitlist} on the waitlist` : ''}</p> : null}
      </div>
      <form onSubmit={save} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
        {message ? <p role="status" className={`rounded-lg border p-3 text-sm sm:col-span-2 ${message.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>{message.text}</p> : null}
        <label className="text-sm font-medium text-text-primary">Registration closes
          <input type="datetime-local" value={form.closes} onChange={(e) => setForm({ ...form, closes: e.target.value })} className={input} />
        </label>
        <label className="text-sm font-medium text-text-primary">Player limit
          <input inputMode="numeric" value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value.replace(/[^0-9]/g, '') })} placeholder="No limit" className={input} />
        </label>
        <label className="text-sm font-medium text-text-primary">Born on or after <span className="font-normal text-text-muted">(Under-19: 1 Jan 2008)</span>
          <input type="date" value={form.after} onChange={(e) => setForm({ ...form, after: e.target.value })} className={input} />
        </label>
        <label className="text-sm font-medium text-text-primary">Born on or before <span className="font-normal text-text-muted">(optional)</span>
          <input type="date" value={form.before} onChange={(e) => setForm({ ...form, before: e.target.value })} className={input} />
        </label>
        <div className="sm:col-span-2"><button disabled={busy} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Save limits</button></div>
      </form>
    </section>
  );
}
