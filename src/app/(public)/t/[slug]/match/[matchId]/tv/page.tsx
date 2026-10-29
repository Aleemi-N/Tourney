import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';
/**
 * /t/[slug]/match/[matchId]/tv — TV / Projector presentation mode.
 *
 * Full-screen scoreboard suitable for display on a projector or large screen.
 * Fetches SSR initial state via get_public_match_state (anon-safe),
 * then hydrates with Realtime via PublicMatchLive(tvMode=true).
 *
 * SECURITY: Same security boundary as the regular match view.
 * No mutation capability, no private data.
 */

import { createClient } from '@/lib/api/server';
import { getTeamColors, getTournamentHeader } from '@/lib/tournament-header';
import { PublicMatchLive } from '@/components/public/PublicMatchLive';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string; matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, matchId } = await params;
  const meta = await buildTournamentMetadata(slug, 'match', { matchId, subtitle: 'Scoreboard' });
  return {
    ...meta,
    robots: { index: false },
  };
}

export default async function TVMatchPage({ params }: Props) {
  const { slug, matchId } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) {
    return (
      <div data-theme="dark" className="fixed inset-0 flex items-center justify-center bg-background">
        <p className="text-xl font-bold text-text-muted">Tournament not found</p>
      </div>
    );
  }

  const api = await createClient();
  const { data: matchState, error } = await api.rpc('get_public_match_state', {
    p_match_id: matchId,
  });

  if (error || !matchState) {
    return (
      <div data-theme="dark" className="fixed inset-0 flex items-center justify-center bg-background">
        <p className="text-xl font-bold text-text-muted">Match not available</p>
      </div>
    );
  }

  const teams = matchState as unknown as { home_team: { id: string }; away_team: { id: string } };
  const colors = await getTeamColors([teams.home_team.id, teams.away_team.id]);

  return (
    <PublicMatchLive
      matchId={matchId}
      initialState={matchState as never}
      tvMode
      homeColor={colors[teams.home_team.id]}
      awayColor={colors[teams.away_team.id]}
    />
  );
}
