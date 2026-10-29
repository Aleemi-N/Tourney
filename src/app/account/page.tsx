import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { AccountDataPanel } from '@/components/account/AccountDataPanel';

export const metadata: Metadata = { title: 'Your data', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const api = await createClient();
  const { data: { user } } = await api.auth.getUser();
  if (!user) redirect('/login?next=/account');
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-primary hover:underline">Home</Link>
      <h1 className="mt-4 text-3xl font-black tracking-tight">Your data</h1>
      <p className="mt-2 text-text-secondary">Download what Tourny holds about you, or delete your account. See the <Link href="/privacy" className="font-semibold text-primary hover:underline">privacy policy</Link> for what is collected and why.</p>
      <div className="mt-8"><AccountDataPanel email={user.email ?? ''} /></div>
    </main>
  );
}
