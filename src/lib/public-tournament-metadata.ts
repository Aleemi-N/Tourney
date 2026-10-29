import type { Metadata } from 'next';
import { cache } from 'react';
import { createClient } from './api/server';
import { getCanonicalOrigin, getAbsoluteUrl, TOURNY_PRODUCTION_ORIGIN } from './origin';

export { TOURNY_PRODUCTION_ORIGIN, getCanonicalOrigin, getAbsoluteUrl };

export type PublicTournamentMetadata = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  format: string;
  league_mode: string | null;
  is_public: boolean;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

/**
 * Fetches public tournament metadata by slug.
 * React cache deduplicates calls within a single RSC render lifecycle.
 */
export const getPublicTournamentMetadata = cache(async (slug: string): Promise<PublicTournamentMetadata | null> => {
  if (!slug) return null;
  const normalizedSlug = slug.trim().toLowerCase();
  const api = await createClient();

  const { data } = await api
    .from('tournaments')
    .select('id, name, slug, description, status, format, league_mode, is_public, tournament_branding(logo_path, primary_color, secondary_color)')
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (!data) return null;

  const branding = Array.isArray(data.tournament_branding)
    ? data.tournament_branding[0]
    : data.tournament_branding;

  const logoUrl = branding?.logo_path
    ? api.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl
    : null;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    status: data.status,
    format: data.format,
    league_mode: data.league_mode,
    is_public: data.is_public,
    logoUrl,
    primaryColor: branding?.primary_color ?? null,
    secondaryColor: branding?.secondary_color ?? null,
  };
});

export type MetadataContext =
  | 'tournament'
  | 'player'
  | 'team'
  | 'owner'
  | 'fixtures'
  | 'results'
  | 'table'
  | 'standings'
  | 'teams'
  | 'players'
  | 'live'
  | 'match';

/**
 * Builds unified, dynamic, and tournament-specific metadata for public tournament routes.
 * Guarantees that canonical, OpenGraph, and Twitter tags are strictly scoped to the
 * CURRENT tournament's slug and branding.
 */
export async function buildTournamentMetadata(
  slug: string,
  context: MetadataContext,
  extra?: { matchId?: string; subtitle?: string }
): Promise<Metadata> {
  const tournament = await getPublicTournamentMetadata(slug);

  if (!tournament) {
    return {
      title: { absolute: 'Tournament Not Found | Tourny' },
      robots: { index: false, follow: false },
    };
  }

  const registrationOpen = tournament.status === 'REGISTRATION';
  let path: string;
  let title: string;
  let description: string;
  let ogContext: string = context;

  switch (context) {
    case 'player':
      path = `/t/${tournament.slug}/register/player`;
      title = `${tournament.name} | Player Registration`;
      description = registrationOpen
        ? `Register as a player for ${tournament.name}.`
        : `Player registration for ${tournament.name} is currently closed.`;
      ogContext = 'player';
      break;

    case 'team':
    case 'owner':
      path = `/t/${tournament.slug}/register/team`;
      title = `${tournament.name} | Team Registration`;
      description = registrationOpen
        ? `Register or apply as a team for ${tournament.name}.`
        : `Team registration for ${tournament.name} is currently closed.`;
      ogContext = 'team';
      break;

    case 'fixtures':
      path = `/t/${tournament.slug}/fixtures`;
      title = `${tournament.name} | Fixtures & Schedule`;
      description = `Upcoming and scheduled matches for ${tournament.name}.`;
      ogContext = 'fixtures';
      break;

    case 'results':
      path = `/t/${tournament.slug}/results`;
      title = `${tournament.name} | Match Results`;
      description = `Match results and scores from ${tournament.name}.`;
      ogContext = 'results';
      break;

    case 'table':
    case 'standings':
      path = `/t/${tournament.slug}/table`;
      title = `${tournament.name} | Standings`;
      description = `League table and standings for ${tournament.name}.`;
      ogContext = 'standings';
      break;

    case 'teams':
      path = `/t/${tournament.slug}/teams`;
      title = `${tournament.name} | Teams`;
      description = `All teams competing in ${tournament.name}.`;
      ogContext = 'teams';
      break;

    case 'players':
      path = `/t/${tournament.slug}/players`;
      title = `${tournament.name} | Players`;
      description = `All approved players in ${tournament.name}.`;
      ogContext = 'players';
      break;

    case 'live':
      path = `/t/${tournament.slug}/live`;
      title = `${tournament.name} | Live Scoreboard & Updates`;
      description = `Follow ${tournament.name} live — auction, lot draw, and match scores in real time.`;
      ogContext = 'live';
      break;

    case 'match':
      path = extra?.matchId ? `/t/${tournament.slug}/match/${extra.matchId}` : `/t/${tournament.slug}/live`;
      title = extra?.subtitle ? `${tournament.name} | ${extra.subtitle}` : `${tournament.name} | Live Match`;
      description = `Follow this live match from ${tournament.name} in real time.`;
      ogContext = 'match';
      break;

    case 'tournament':
    default:
      path = `/t/${tournament.slug}`;
      title = tournament.name;
      description = tournament.description?.trim() || `Follow ${tournament.name}, a volleyball tournament on Tourny.`;
      ogContext = 'tournament';
      break;
  }

  const canonical = new URL(path, TOURNY_PRODUCTION_ORIGIN);
  const ogImageUrl = new URL(`/api/og/tournament/${tournament.slug}?context=${ogContext}`, TOURNY_PRODUCTION_ORIGIN);

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
      images: [
        {
          url: ogImageUrl.toString(),
          width: 1200,
          height: 630,
          alt: `${tournament.name} — ${title}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl.toString()],
    },
  };
}
