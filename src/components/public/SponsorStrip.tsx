'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { callRpc } from '@/lib/web-push';

export type Sponsor = { id: string; name: string; logo_path: string | null; website: string | null; tier: 'TITLE' | 'SPONSOR' | 'PARTNER' };
export type PublicExtras = { stream_url: string | null; sponsors: Sponsor[] };

/** The stream link and sponsors of a public tournament (null while loading or when there is nothing to show). */
export function usePublicExtras(slug: string): PublicExtras | null {
  const [extras, setExtras] = useState<PublicExtras | null>(null);
  useEffect(() => {
    let live = true;
    void callRpc('get_public_extras', { p_slug: slug }).then(({ data }) => { if (live) setExtras((data as PublicExtras | null) ?? null); });
    return () => { live = false; };
  }, [slug]);
  return extras;
}

const logoUrl = (path: string) => createClient().storage.from('logos').getPublicUrl(path).data.publicUrl;

/** Sponsor logos in a row; the title sponsor is larger. Sponsors without a logo show their name. */
export function SponsorStrip({ sponsors, compact = false }: { sponsors: Sponsor[]; compact?: boolean }) {
  if (sponsors.length === 0) return null;
  const item = (s: Sponsor) => {
    const height = s.tier === 'TITLE' ? (compact ? 28 : 56) : s.tier === 'SPONSOR' ? (compact ? 22 : 40) : (compact ? 18 : 28);
    const inner = s.logo_path ? (
      // eslint-disable-next-line @next/next/no-img-element -- logos come from the storage bucket
      <img src={logoUrl(s.logo_path)} alt={s.name} style={{ height }} className="w-auto max-w-[10rem] object-contain" />
    ) : <span className="text-sm font-bold text-text-secondary">{s.name}</span>;
    return s.website ? <a key={s.id} href={s.website} target="_blank" rel="noopener noreferrer sponsored" aria-label={s.name} className="inline-flex items-center">{inner}</a> : <span key={s.id} className="inline-flex items-center">{inner}</span>;
  };
  return <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">{sponsors.map(item)}</div>;
}
