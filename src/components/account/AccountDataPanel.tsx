'use client';

import { useState } from 'react';
import { createClient } from '@/lib/api/client';
import { callRpc } from '@/lib/web-push';

const field = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';

/** Download my data, and delete my account. */
export function AccountDataPanel({ email }: { email: string }) {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function download() {
    setBusy('export');
    setMessage(null);
    const { data, error } = await callRpc('export_my_data', {});
    setBusy(null);
    if (error) return setMessage({ ok: false, text: error.message });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tourny-my-data.json';
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ ok: true, text: 'Your data was downloaded as tourny-my-data.json.' });
  }

  async function remove(event: React.FormEvent) {
    event.preventDefault();
    setBusy('delete');
    setMessage(null);
    const api = createClient();
    const { data: session } = await api.auth.getSession();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setBusy(null);
      return setMessage({ ok: false, text: json.error ?? `Could not delete the account (${response.status}).` });
    }
    await api.auth.signOut();
    window.location.href = '/';
  }

  return (
    <div className="space-y-8">
      {message ? <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${message.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>{message.text}</p> : null}

      <section className="rounded-3xl border border-border bg-surface p-6" aria-labelledby="export-heading">
        <h2 id="export-heading" className="text-lg font-black">Download my data</h2>
        <p className="mt-2 text-sm text-text-secondary">A file with everything Tourny holds about {email}: your profile, registrations, team roles and payments.</p>
        <button type="button" onClick={() => void download()} disabled={busy !== null} className="mt-4 min-h-11 rounded-xl border border-border-strong px-5 font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50">Download my data</button>
      </section>

      <section className="rounded-3xl border border-danger/30 bg-surface p-6" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="text-lg font-black text-danger">Delete my account</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
          <li>Your name, phone, email, photo and sign-in are removed, and you are signed out everywhere. This cannot be undone.</li>
          <li>Registrations that are still waiting for a decision are withdrawn.</li>
          <li>Results you appear in stay, shown as &quot;Former player&quot;, so other people&apos;s standings remain correct. Payment records stay for the organizer&apos;s accounts, without your screenshot.</li>
          <li>If you are the only organizer of a tournament that is still running, finish or archive it, or add another organizer, first.</li>
        </ul>
        <form onSubmit={remove} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-text-primary">Type DELETE to confirm
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} className={field} />
          </label>
          <button disabled={busy !== null || confirm !== 'DELETE'} className="min-h-11 rounded-xl bg-danger px-5 font-semibold text-text-inverse hover:opacity-90 disabled:opacity-50">Delete my account</button>
        </form>
      </section>
    </div>
  );
}
