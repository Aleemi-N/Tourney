import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KIND_LABEL, type Certificate } from '@/components/certificates/CertificateSheet';
import { createClient } from '@/lib/api/server';

export const metadata: Metadata = { title: 'Certificates' };

export default async function OrganizerCertificatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await createClient();
  const { data: tournament } = await api.from('tournaments').select('id,name,slug,status').eq('id', id).maybeSingle();
  if (!tournament) notFound();
  const rpc = api as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = await rpc.rpc('get_certificates', { p_tournament_id: id });
  const certs = (data ?? []) as Certificate[];
  const done = tournament.status === 'COMPLETED' || tournament.status === 'ARCHIVED';
  const groups = Object.keys(KIND_LABEL).map((kind) => ({ kind, items: certs.filter((c) => c.kind === kind) })).filter((g) => g.items.length > 0);
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <p className="text-sm text-text-secondary">{tournament.name}</p>
      <h1 className="mt-2 text-3xl font-black text-text-primary">Certificates</h1>
      <p className="mt-3 max-w-2xl text-text-secondary">Certificates for the champions and runners-up, each tournament award, every player of the match, and everyone who took part. They are made from the tournament&apos;s own records and become public when the tournament is completed. Open one to print it or save it as a PDF, or print a whole group at once.</p>
      {!done ? <p role="status" className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-sm font-medium">This tournament is not completed yet, so this is a preview only the organizers can see. The champions and runners-up appear once it is completed.</p> : null}
      {groups.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-sm text-text-secondary">Nothing to show yet. Approve players, give awards and score matches first.</p> : (
        <div className="mt-8 space-y-4">
          {groups.map((g) => (
            <details key={g.kind} className="rounded-2xl border border-border bg-surface p-5" open={g.items.length <= 12}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
                <span className="text-lg font-black">{KIND_LABEL[g.kind]} <span className="text-sm font-semibold text-text-muted">({g.items.length})</span></span>
                <Link href={`/t/${tournament.slug}/certificates?kind=${g.kind}`} target="_blank" className="rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold text-text-secondary hover:bg-surface-muted">Print all</Link>
              </summary>
              <ul className="mt-4 divide-y divide-border">
                {g.items.map((c) => (
                  <li key={c.cert_key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span><span className="font-semibold">{c.recipient}</span>{c.team_name ? <span className="text-text-muted"> · {c.team_name}</span> : null}{g.kind === 'AWARD' || g.kind === 'MVP' ? <span className="text-text-secondary"> · {c.title}{c.kind === 'MVP' && c.detail ? ` (${c.detail})` : ''}</span> : null}</span>
                    <Link href={`/t/${tournament.slug}/certificate/${encodeURIComponent(c.cert_key)}`} target="_blank" aria-label={`Open the certificate for ${c.recipient}`} className="font-semibold text-primary hover:underline">Open</Link>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}
