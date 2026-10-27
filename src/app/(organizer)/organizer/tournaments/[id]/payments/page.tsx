import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PaymentsManager } from './PaymentsManager';

export const metadata: Metadata = { title: 'Payments' };

export default async function OrganizerPaymentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name').eq('id', id).maybeSingle();
  if (!tournament) notFound();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <p className="text-sm text-text-secondary">{tournament.name}</p>
      <h1 className="mt-2 text-3xl font-black text-text-primary">Payments</h1>
      <p className="mt-3 max-w-2xl text-text-secondary">Registration fees collected, refunds, and who has paid.</p>
      <div className="mt-8"><PaymentsManager tournamentId={id} /></div>
    </main>
  );
}
