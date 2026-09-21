import type { Metadata } from 'next';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export const TOURNY_PRODUCTION_ORIGIN = 'https://tournyappfyniti.vercel.app';

export type PublicTournamentMetadata = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  logoUrl: string | null;
};

export const getPublicTournamentMetadata = cache(async (slug: string): Promise<PublicTournamentMetadata | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tournaments')
    .select('id, name, slug, description, status, tournament_branding(logo_path)')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();

  if (!data) return null;

  const branding = Array.isArray(data.tournament_branding)
    ? data.tournament_branding[0]
    : data.tournament_branding;
  const logoUrl = branding?.logo_path
    ? supabase.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl
    : null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    status: data.status,
    logoUrl,
  };
});

type MetadataContext = 'tournament' | 'player' | 'owner';

export async function buildTournamentMetadata(slug: string, context: MetadataContext): Promise<Metadata> {
  const tournament = await getPublicTournamentMetadata(slug);
  if (!tournament) {
    return {
      title: { absolute: 'Tournament Not Found | Tourny' },
      robots: { index: false, follow: false },
    };
  }

  const registrationOpen = tournament.status === 'REGISTRATION';
  const path = context === 'player'
    ? `/t/${slug}/register/player`
    : context === 'owner'
      ? `/t/${slug}/register/owner`
      : `/t/${slug}`;
  const title = context === 'player'
    ? `${tournament.name} — Player Registration`
    : context === 'owner'
      ? `${tournament.name} — Team Owner Registration`
      : tournament.name;
  const description = context === 'player'
    ? registrationOpen
      ? `Register as a player for ${tournament.name}.`
      : `Player registration for ${tournament.name} is currently closed.`
    : context === 'owner'
      ? registrationOpen
        ? `Apply as a team owner for ${tournament.name}.`
        : `Team owner registration for ${tournament.name} is currently closed.`
      : tournament.description?.trim() || `Follow ${tournament.name}, a volleyball tournament on Tourny.`;
  const canonical = new URL(path, TOURNY_PRODUCTION_ORIGIN);
  const image = new URL(`/api/og/tournament/${slug}`, TOURNY_PRODUCTION_ORIGIN);

  return {
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      title: { absolute: title },
      description,
      url: canonical,
      siteName: 'Tourny',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: `${tournament.name} tournament share card` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
