'use client';

import { useCallback, useEffect, useState } from 'react';
import { callRpc } from '@/lib/web-push';
import { paymentsFetch } from '@/lib/payments-client';

type Account = { connected: boolean; mode?: 'test' | 'live'; keyId?: string; encryptionReady: boolean };

const input = 'mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';

/** Registration fees and the organizer's own Razorpay account. */
export function PaymentSettingsForm({ tournamentId }: { tournamentId: string }) {
  const [fees, setFees] = useState<{ player: string; team: string } | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [keyId, setKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [upi, setUpi] = useState({ id: '', payee: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [f, a] = await Promise.all([
      callRpc('get_registration_fees', { p_tournament_id: tournamentId }),
      paymentsFetch<Account>(`/tournaments/${tournamentId}/account`).catch(() => ({ connected: false, encryptionReady: false }) as Account),
    ]);
    const v = f.data as { player_fee: number; team_fee: number; upi_id?: string | null; upi_payee?: string | null } | null;
    setUpi({ id: v?.upi_id ?? '', payee: v?.upi_payee ?? '' });
    setFees({ player: v && Number(v.player_fee) > 0 ? String(Number(v.player_fee)) : '', team: v && Number(v.team_fee) > 0 ? String(Number(v.team_fee)) : '' });
    setAccount(a);
  }, [tournamentId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server on mount
    void load();
  }, [load]);

  async function saveFees(event: React.FormEvent) {
    event.preventDefault();
    if (!fees) return;
    setBusy('fees');
    setMessage(null);
    const player = fees.player.trim() === '' ? 0 : Number(fees.player);
    const team = fees.team.trim() === '' ? 0 : Number(fees.team);
    if (!Number.isFinite(player) || !Number.isFinite(team) || player < 0 || team < 0) {
      setBusy(null);
      return setMessage({ ok: false, text: 'Enter amounts in rupees, or leave a fee empty for free registration.' });
    }
    const { error } = await callRpc('set_registration_fees', { p_tournament_id: tournamentId, p_player_fee: player, p_team_fee: team });
    setBusy(null);
    if (error) return setMessage({ ok: false, text: error.message });
    setMessage({ ok: true, text: player || team ? 'Fees saved. New registrations will be asked to pay; approval waits for payment.' : 'Registration is free.' });
    await load();
  }

  async function saveUpi(event: React.FormEvent) {
    event.preventDefault();
    setBusy('upi');
    setMessage(null);
    const { error } = await callRpc('set_upi_details', { p_tournament_id: tournamentId, p_upi_id: upi.id.trim(), p_payee: upi.payee.trim() });
    setBusy(null);
    if (error) return setMessage({ ok: false, text: error.message });
    setMessage({ ok: true, text: upi.id.trim() ? 'UPI details saved. Players can now pay you by UPI.' : 'UPI payments are off.' });
    await load();
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy('connect');
    setMessage(null);
    try {
      const a = await paymentsFetch<Account>(`/tournaments/${tournamentId}/account`, { method: 'PUT', body: { keyId: keyId.trim(), keySecret: secret.trim() } });
      setAccount(a);
      setKeyId('');
      setSecret('');
      setMessage({ ok: true, text: `Razorpay connected in ${a.mode} mode.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not connect.' });
    }
    setBusy(null);
  }

  async function disconnect() {
    setBusy('disconnect');
    setMessage(null);
    try {
      setAccount(await paymentsFetch<Account>(`/tournaments/${tournamentId}/account`, { method: 'DELETE' }));
      setMessage({ ok: true, text: 'Razorpay disconnected. Fees are now collected offline.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not disconnect.' });
    }
    setBusy(null);
  }

  if (!fees || !account) return <div className="h-40 animate-pulse rounded-xl border border-border bg-surface" />;
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface" aria-labelledby="fees-heading">
      <div className="border-b border-border px-4 py-5 sm:px-6">
        <h2 id="fees-heading" className="text-lg font-semibold text-text-primary">Registration fees &amp; payments</h2>
        <p className="mt-1 text-sm text-text-secondary">Optional. A registration with a fee cannot be approved until it is paid and you have confirmed it.</p>
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        {message ? <div role="status" className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'}`}>{message.text}</div> : null}

        <form onSubmit={saveFees} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-text-primary">Player fee (₹)
            <input inputMode="decimal" value={fees.player} onChange={(e) => setFees({ ...fees, player: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Free" className={input} />
          </label>
          <label className="text-sm font-medium text-text-primary">Team fee (₹)
            <input inputMode="decimal" value={fees.team} onChange={(e) => setFees({ ...fees, team: e.target.value.replace(/[^0-9.]/g, '') })} placeholder="Free" className={input} />
          </label>
          <button disabled={busy !== null} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Save fees</button>
        </form>

        <form onSubmit={saveUpi} className="space-y-4 border-t border-border pt-5">
          <div>
            <h3 className="font-semibold text-text-primary">Get paid by UPI</h3>
            <p className="mt-1 text-sm text-text-secondary">The easy way, no account needed. Players pay your UPI ID from any UPI app, then enter the 12-digit reference number. You check your own UPI app or bank and press Confirm received on the Payments page. Works for player and team fees. Leave empty to turn it off.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-text-primary">Your UPI ID
              <input value={upi.id} onChange={(e) => setUpi({ ...upi, id: e.target.value })} placeholder="name@okhdfc" autoComplete="off" spellCheck={false} className={input} />
            </label>
            <label className="text-sm font-medium text-text-primary">Name shown to players
              <input value={upi.payee} onChange={(e) => setUpi({ ...upi, payee: e.target.value })} placeholder="Ravi Kumar" className={input} />
            </label>
            <button disabled={busy !== null} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Save UPI details</button>
          </div>
        </form>

        <div className="border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-text-primary">Card payments with Razorpay (optional)</h3>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-bold text-text-secondary">{account.connected ? `Razorpay · ${account.mode}` : 'Not connected'}</span>
          </div>
          {account.connected ? (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-text-secondary">Players pay on Razorpay&apos;s page and the money goes straight to your Razorpay account ({account.keyId}). Tourny never holds it.{account.mode === 'test' ? ' Test mode moves no real money.' : ''}</p>
              <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className="min-h-11 rounded-xl border border-danger/40 px-4 font-semibold text-danger hover:bg-danger/10 disabled:opacity-50">Disconnect Razorpay</button>
            </div>
          ) : !account.encryptionReady ? (
            <p className="mt-3 text-sm text-text-secondary">Online payments are not switched on for this server yet. You can still charge a fee and mark registrations as paid yourself.</p>
          ) : (
            <form onSubmit={connect} className="mt-3 space-y-4">
              <p className="text-sm text-text-secondary">To take payments online, connect your own Razorpay account: in the Razorpay dashboard open Account &amp; Settings, then API Keys, and generate a key. Paste the Key ID and Key Secret here. Start with a test key to try it. Skip this if you use UPI or collect in cash.</p>
              <label className="block text-sm font-medium text-text-primary">Razorpay Key ID
                <input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_test_..." autoComplete="off" spellCheck={false} className={input} />
              </label>
              <label className="block text-sm font-medium text-text-primary">Razorpay Key Secret
                <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} className={input} />
              </label>
              <button disabled={busy !== null || !keyId.trim() || !secret.trim()} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">Connect Razorpay</button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
