import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCanonicalOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';

const SECTIONS = ['', '/fixtures', '/results', '/table', '/teams', '/players'];

/** The landing page, legal pages, and every public tournament with its sections. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getCanonicalOrigin();
  const supabase = await createClient();
  const { data } = await supabase.from('public_tournament_view').select('slug,status').limit(500);
  const tournaments = (data ?? []).flatMap((t) =>
    SECTIONS.map((section) => ({
      url: `${origin}/t/${t.slug}${section}`,
      changeFrequency: (t.status === 'LIVE' ? 'hourly' : 'daily') as 'hourly' | 'daily',
    })),
  );
  return [
    { url: origin, changeFrequency: 'weekly' as const },
    { url: `${origin}/privacy`, changeFrequency: 'yearly' as const },
    { url: `${origin}/terms`, changeFrequency: 'yearly' as const },
    ...tournaments,
  ];
}
