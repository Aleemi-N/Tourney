import type { Metadata } from 'next';
import Link from 'next/link';
import { CertificateSheet, KIND_LABEL, type Certificate } from '@/components/certificates/CertificateSheet';
import { PrintButton } from '@/components/certificates/PrintButton';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Certificates', robots: { index: false } };

/** Every certificate of one kind on its own page, for printing in one go: /t/{slug}/certificates?kind=PARTICIPANT */
export default async function CertificatesPrintPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { slug } = await params;
  const { kind } = await searchParams;
  const tournament = await getTournamentHeader(slug);
  const supabase = (await createClient()) as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = tournament ? await supabase.rpc('get_certificates', { p_tournament_id: tournament.id }) : { data: null };
  const all = (data ?? []) as Certificate[];
  const certs = kind && KIND_LABEL[kind] ? all.filter((c) => c.kind === kind) : all;
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 print:p-0">
      <style>{'@page{size:A4 landscape;margin:0}'}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/t/${slug}`} className="text-sm font-semibold text-primary hover:underline">{tournament?.name ?? 'Tournament'}</Link>
        <p className="text-sm text-text-secondary">{certs.length} certificate{certs.length === 1 ? '' : 's'}{kind && KIND_LABEL[kind] ? `: ${KIND_LABEL[kind]}` : ''}</p>
        <PrintButton label="Print all" />
      </div>
      {certs.length === 0 ? <p className="text-center text-text-secondary">No certificates yet. They are available once the tournament is completed.</p> : (
        <div className="space-y-8 print:space-y-0">
          {certs.map((c) => <CertificateSheet key={c.cert_key} cert={c} logoUrl={tournament?.logoUrl} />)}
        </div>
      )}
    </main>
  );
}
