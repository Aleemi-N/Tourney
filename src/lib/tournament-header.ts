import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type TournamentHeader = {
  id: string;
  name: string;
  slug: string;
  status: string;
  format: string;
  league_mode: string | null;
  logoUrl: string | null;
};

/**
 * Fetches the minimal public tournament header data needed by all sub-pages.
 * Cached per request (React cache) — multiple sub-pages share this call.
 */
export const getTournamentHeader = cache(async (slug: string): Promise<TournamentHeader | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tournaments')
    .select('id, name, slug, status, format, league_mode, tournament_branding(logo_path)')
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
    status: data.status,
    format: data.format,
    league_mode: data.league_mode,
    logoUrl,
  };
});

/** Primary colours of public teams by id (missing teams map to nothing). */
export async function getTeamColors(teamIds: string[]): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const { data } = await supabase.from('public_team_view').select('id, primary_color').in('id', teamIds);
  return Object.fromEntries((data ?? []).map((team) => [team.id as string, team.primary_color as string | null]));
}
