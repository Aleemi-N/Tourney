import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FinanceManager } from './FinanceManager';

export const metadata: Metadata = { title: 'Income & expenses' };

export default async function OrganizerFinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name').eq('id', id).maybeSingle();
  if (!tournament) notFound();
  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-8">
      <p className="text-sm text-text-secondary">{tournament.name}</p>
      <h1 className="mt-2 text-3xl font-black text-text-primary">Income &amp; expenses</h1>
      <p className="mt-3 max-w-2xl text-text-secondary">Everything this tournament earned and spent. Registration fees that were paid and refunded appear here by themselves; add the rest (sponsors, venue, referees, prizes) yourself. Entries are never deleted, only voided, and every change is logged.</p>
      <div className="mt-8"><FinanceManager tournamentId={id} tournamentName={tournament.name} /></div>
    </main>
  );
}
