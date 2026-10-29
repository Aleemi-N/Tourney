import { createClient } from '@/lib/api/server';

// payments-client is a client module, so the server formats the amount itself.
const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

type Fees = { player_fee: number; team_fee: number; online: boolean; upi: boolean };

/** "Registration fee: ₹250" shown before registering. Renders nothing for a free tournament. */
export async function FeeNotice({ tournamentId, kind }: { tournamentId: string; kind: 'PLAYER' | 'TEAM' }) {
  const api = (await createClient()) as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = await api.rpc('get_registration_fees', { p_tournament_id: tournamentId });
  const fees = data as Fees | null;
  const amount = Number(kind === 'PLAYER' ? fees?.player_fee : fees?.team_fee);
  if (!fees || !(amount > 0)) return null;
  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4" role="note">
      <p className="font-bold text-text-primary">Registration fee: {rupees(amount)}</p>
      <p className="mt-1 text-sm text-text-secondary">
        {fees.online || fees.upi ? `You can pay ${fees.online ? 'online' : 'by UPI'} right after you register. ` : 'The organizer collects this fee directly and marks you as paid. '}
        Your registration is approved once the fee is settled.
      </p>
    </div>
  );
}
