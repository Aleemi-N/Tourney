import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

/** Where Razorpay sends a payer back to. The status itself is read from Razorpay by the API, not from this address. */
export default function PaymentDone() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">Thanks. We are confirming your payment.</h1>
      <p className="mt-3 text-text-secondary">Open your account to see it. If you paid in the Tourny app, go back to the app and tap &quot;I have paid: check now&quot;.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/player" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover">Player account</Link>
        <Link href="/owner/dashboard" className="inline-flex min-h-11 items-center rounded-xl border border-border-strong px-5 font-semibold text-text-secondary hover:bg-surface-muted">Team owner account</Link>
      </div>
    </main>
  );
}
