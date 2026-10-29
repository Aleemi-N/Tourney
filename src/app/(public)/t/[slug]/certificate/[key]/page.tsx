import type { Metadata } from 'next';
import Link from 'next/link';
import { CertificateSheet, type Certificate } from '@/components/certificates/CertificateSheet';
import { PrintButton } from '@/components/certificates/PrintButton';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Certificate', robots: { index: false } };

/** One certificate, ready to print: /t/{slug}/certificate/{key}. Public once the tournament is completed. */
export default async function CertificatePage({ params }: { params: Promise<{ slug: string; key: string }> }) {
  const { slug, key } = await params;
  const tournament = await getTournamentHeader(slug);
  const api = (await createClient()) as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = tournament ? await api.rpc('get_certificate', { p_tournament_id: tournament.id, p_key: decodeURIComponent(key) }) : { data: null };
  const cert = ((data ?? []) as Certificate[])[0];
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-8 print:p-0">
      <style>{'@page{size:A4 landscape;margin:0}'}</style>
      {!tournament || !cert ? (
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-black">Certificate not found</h1>
          <p className="mt-2 text-text-secondary">Certificates are available once the tournament is completed.</p>
          <Link href={`/t/${slug}`} className="mt-4 inline-block font-semibold text-primary hover:underline">Back to the tournament</Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between print:hidden">
            <Link href={`/t/${slug}`} className="text-sm font-semibold text-primary hover:underline">{tournament.name}</Link>
            <PrintButton />
          </div>
          <CertificateSheet cert={cert} logoUrl={tournament.logoUrl} />
        </>
      )}
    </main>
  );
}
