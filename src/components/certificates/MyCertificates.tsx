'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { callRpc } from '@/lib/web-push';

type Item = { cert_key: string; title: string; team_name: string | null; detail: string | null; tournament_name: string; tournament_slug: string };

/** The signed-in player's certificates from finished tournaments. Renders nothing when there are none. */
export function MyCertificates() {
  const [items, setItems] = useState<Item[] | null>(null);
  useEffect(() => {
    void callRpc('my_certificates', {}).then(({ data }) => setItems((data ?? []) as Item[]));
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="mt-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">My certificates</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((c) => (
          <article key={c.cert_key + c.tournament_slug} className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-5">
            <div>
              <h3 className="font-black">{c.title}</h3>
              <p className="text-sm text-text-muted">{c.tournament_name}{c.team_name ? ` · ${c.team_name}` : ''}</p>
            </div>
            <Link href={`/t/${c.tournament_slug}/certificate/${encodeURIComponent(c.cert_key)}`} aria-label={`Open the ${c.title} certificate for ${c.tournament_name}`} className="text-sm font-semibold text-primary hover:underline">Open</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
