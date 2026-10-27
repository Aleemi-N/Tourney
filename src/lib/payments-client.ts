'use client';

import { createClient } from '@/lib/supabase/client';

export const rupees = (n: number | string | null | undefined) => `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const STATUS_LABEL: Record<string, string> = {
  DUE: 'Payment due', CREATED: 'Waiting for payment', PAID: 'Paid', WAIVED: 'Fee waived', EXPIRED: 'Payment link expired', CANCELLED: 'Payment cancelled',
  REFUNDED: 'Refunded', PARTIALLY_REFUNDED: 'Partly refunded', SUBMITTED: 'Waiting for organizer to confirm', REJECTED: 'Not received',
};

/** The link that opens a UPI app (GPay, PhonePe, Paytm...) with the payee, amount and a note filled in; also what the QR code holds. */
export const upiLink = (upiId: string, payee: string | null, amount: number, note: string) =>
  `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee || 'Organizer')}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note.slice(0, 40))}`;

/** Calls a payments endpoint of the API as the signed-in user. Errors carry the server's own message. */
export async function paymentsFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/payments/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`);
  return json as T;
}
