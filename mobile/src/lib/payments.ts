import { api, apiUrl } from '@/lib/api';

export type PaymentDue = { kind: 'PLAYER' | 'TEAM'; registration_id: string; tournament_id: string; tournament_name: string; label: string; amount: number; online: boolean; status: string; upi_id: string | null; upi_payee: string | null; utr: string | null; note: string | null; payment_id: string | null; has_proof: boolean };
export type RegistrationPayment = { kind: 'PLAYER' | 'TEAM'; registration_id: string; payment_id: string; status: string; amount: number; provider: string; refunded_amount: number; paid_at: string | null; note: string | null; label?: string | null; utr?: string | null; has_proof?: boolean };
export type PaymentReceipt = { receipt_no: string; tournament: string; name: string | null; kind: 'PLAYER' | 'TEAM'; amount: number; refunded_amount: number; status: string; currency: string; method: string; reference: string | null; paid_at: string | null; paid_to: string | null };
export type ReceiptListItem = { payment_id: string; tournament_name: string; label: string | null; kind: 'PLAYER' | 'TEAM'; amount: number; refunded_amount: number; status: string; paid_at: string | null; method: string };
export type Fees = { player_fee: number; team_fee: number; currency: string; online: boolean; upi: boolean; upi_id?: string | null; upi_payee?: string | null };

/** The link that opens the payer's UPI app (GPay, PhonePe, Paytm...) with the payee, amount and a note filled in. */
export const upiLink = (upiId: string, payee: string | null, amount: number, note: string) =>
  `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payee || 'Organizer')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note.slice(0, 40))}`;

export const rupees = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** Calls a payments endpoint of the API as the signed-in user. Errors carry the server's own message. */
export async function paymentsFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await api.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const response = await fetch(`${apiUrl}/payments${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`);
  return json as T;
}

export const STATUS_LABEL: Record<string, string> = {
  DUE: 'Payment due', CREATED: 'Waiting for payment', PAID: 'Paid', WAIVED: 'Fee waived', EXPIRED: 'Payment link expired', CANCELLED: 'Payment cancelled',
  REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded', SUBMITTED: 'Waiting for organizer to confirm', REJECTED: 'Not received',
};
