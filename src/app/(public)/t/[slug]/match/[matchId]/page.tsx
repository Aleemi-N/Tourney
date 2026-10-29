import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';
import type { Metadata } from 'next';
import { createClient } from '@/lib/api/server';
import { getTeamColors, getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound } from '@/components/public/TournamentNotFound';
import { PublicMatchLive } from '@/components/public/PublicMatchLive';
import { buttonClasses } from '@/components/ui/Button';

import Link from 'next/link';
import { ArrowLeft, CalendarDays, Tv } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string; matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, matchId } = await params;
  const meta = await buildTournamentMetadata(slug, 'match', { matchId });
  return {
    ...meta,
    robots: { index: false },
  };
}

export default async function PublicMatchPage({ params }: Props) {
  const { slug, matchId } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const api = await createClient();
  const { data: matchState, error } = await api.rpc('get_public_match_state', {
    p_match_id: matchId,
  });

  if (error || !matchState) {
    return (
      <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
        <div className="py-16 text-center">
          <p className="mb-2 text-lg font-bold text-text-primary">Match not available</p>
          <p className="text-sm text-text-secondary">This match may not exist or is not publicly accessible.</p>
          <Link href={`/t/${slug}/fixtures`} className={buttonClasses({ variant: 'secondary', className: 'mt-6' })}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            View fixtures
          </Link>
        </div>
      </PublicTournamentFrame>
    );
  }

  const teams = matchState as unknown as { home_team: { id: string }; away_team: { id: string } };
  const colors = await getTeamColors([teams.home_team.id, teams.away_team.id]);

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link href={`/t/${slug}/fixtures`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          All fixtures
        </Link>
        <Link
          href={`/t/${slug}/match/${matchId}/tv`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open TV scoreboard in a new tab"
          className={buttonClasses({ variant: 'secondary', size: 'sm' })}
        >
          <Tv className="h-4 w-4" aria-hidden="true" />
          TV view
        </Link>
      </div>
      <PublicMatchLive
        matchId={matchId}
        initialState={matchState as never}
        homeColor={colors[teams.home_team.id]}
        awayColor={colors[teams.away_team.id]}
      />
    </PublicTournamentFrame>
  );
}
