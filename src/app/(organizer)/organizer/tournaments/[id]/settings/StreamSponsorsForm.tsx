'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/api/client';
import { callRpc } from '@/lib/web-push';
import { SponsorStrip, type Sponsor } from '@/components/public/SponsorStrip';

type Row = Sponsor & { display_order: number };
const input = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';
const blank = { id: null as string | null, name: '', website: '', tier: 'SPONSOR' as Sponsor['tier'], order: '0' };
const TIERS: [Sponsor['tier'], string][] = [['TITLE', 'Title sponsor'], ['SPONSOR', 'Sponsor'], ['PARTNER', 'Partner']];

/** The live stream link ("Watch live" on the public pages) and the sponsors shown on them. */
export function StreamSponsorsForm({ tournamentId }: { tournamentId: string }) {
  const [stream, setStream] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState(blank);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const api = createClient();
    const [s, l] = await Promise.all([
      api.from('tournament_settings').select('*').eq('tournament_id', tournamentId).maybeSingle(),
      callRpc('list_sponsors', { p_tournament_id: tournamentId }),
    ]);
    setStream(((s.data as { stream_url?: string | null } | null)?.stream_url) ?? '');
    setRows((l.data ?? []) as Row[]);
  }, [tournamentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void load();
  }, [load]);

  async function saveStream(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await callRpc('set_stream_url', { p_tournament_id: tournamentId, p_url: stream ?? '' });
    setBusy(false);
    setMessage(error ? { ok: false, text: error.message } : { ok: true, text: stream?.trim() ? 'Stream link saved. "Watch live" now shows on the public pages.' : 'Stream link removed.' });
  }

  async function saveSponsor(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    let logoPath: string | null = null;
    if (logo) {
      if (logo.size > 2 * 1024 * 1024) { setBusy(false); return setMessage({ ok: false, text: 'The logo must be under 2 MB.' }); }
      const ext = logo.type === 'image/png' ? 'png' : logo.type === 'image/webp' ? 'webp' : 'jpg';
      logoPath = `${tournamentId}/sponsor-${Date.now()}.${ext}`;
      const { error: up } = await createClient().storage.from('logos').upload(logoPath, logo, { contentType: logo.type, upsert: true });
      if (up) { setBusy(false); return setMessage({ ok: false, text: up.message }); }
    }
    const { error } = await callRpc('save_sponsor', { p_tournament_id: tournamentId, p_id: form.id, p_name: form.name, p_website: form.website, p_tier: form.tier, p_logo_path: logoPath, p_order: Number(form.order) || 0 });
    setBusy(false);
    if (error) return setMessage({ ok: false, text: error.message });
    setForm(blank);
    setLogo(null);
    setMessage({ ok: true, text: 'Sponsor saved.' });
    await load();
  }

  async function remove(row: Row) {
    if (!window.confirm(`Remove ${row.name}?`)) return;
    const { error } = await callRpc('delete_sponsor', { p_id: row.id });
    if (error) return setMessage({ ok: false, text: error.message });
    await load();
  }

  if (stream === null || !rows) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-labelledby="stream-heading">
      <div className="border-b border-border px-4 py-5 sm:px-6">
        <h2 id="stream-heading" className="text-lg font-semibold text-text-primary">Live stream &amp; sponsors</h2>
        <p className="mt-1 text-sm text-text-secondary">A stream link adds a &quot;Watch live&quot; button to the public pages. Sponsors appear at the bottom of the public pages (and under the streaming scoreboard, see Embed).</p>
      </div>
      <div className="space-y-8 p-4 sm:p-6">
        {message ? <p role="status" className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>{message.text}</p> : null}

        <form onSubmit={saveStream} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-text-primary">Live stream link
            <input type="url" value={stream} onChange={(e) => setStream(e.target.value)} placeholder="https://www.youtube.com/live/..." className={input} />
          </label>
          <button disabled={busy} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Save link</button>
        </form>

        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="font-semibold text-text-primary">Sponsors</h3>
          {rows.length > 0 ? (
            <>
              <div className="rounded-xl border border-border bg-background p-4"><SponsorStrip sponsors={rows} compact /></div>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span><span className="font-semibold">{r.name}</span> <span className="text-text-muted">· {TIERS.find(([t]) => t === r.tier)?.[1]}</span></span>
                    <span className="flex gap-3 font-semibold">
                      <button type="button" onClick={() => { setForm({ id: r.id, name: r.name, website: r.website ?? '', tier: r.tier, order: String(r.display_order) }); setLogo(null); }} className="min-h-9 text-primary hover:underline" aria-label={`Edit ${r.name}`}>Edit</button>
                      <button type="button" onClick={() => void remove(r)} className="min-h-9 text-danger hover:underline" aria-label={`Remove ${r.name}`}>Remove</button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-text-secondary">No sponsors yet.</p>}

          <form onSubmit={saveSponsor} className="grid gap-4 sm:grid-cols-2" aria-label={form.id ? 'Edit sponsor' : 'Add a sponsor'}>
            <label className="text-sm font-medium text-text-primary">Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={80} className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary">Website (optional)
              <input type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary">Level
              <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as Sponsor['tier'] })} className={input}>{TIERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-text-primary">Order (smaller shows first)
              <input inputMode="numeric" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value.replace(/[^0-9]/g, '') })} className={input} />
            </label>
            <div className="sm:col-span-2">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-border-strong px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted focus-within:ring-2 focus-within:ring-primary/40">
                {logo ? `Logo: ${logo.name}` : form.id ? 'Replace the logo (optional)' : 'Upload a logo (optional)'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload a sponsor logo" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button disabled={busy} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{form.id ? 'Save sponsor' : 'Add sponsor'}</button>
              {form.id ? <button type="button" onClick={() => { setForm(blank); setLogo(null); }} className="min-h-11 rounded-xl border border-border-strong px-5 font-semibold text-text-secondary hover:bg-surface-muted">Cancel</button> : null}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
