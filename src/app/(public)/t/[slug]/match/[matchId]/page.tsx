import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound } from '@/components/public/TournamentNotFound';
import { PublicMatchLive } from '@/components/public/PublicMatchLive';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string; matchId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await getTournamentHeader(slug);
  if (!t) return { title: 'Tournament Not Found | Tourny', robots: { index: false, follow: false } };
  return {
    title: { absolute: `${t.name} — Live Match` },
    description: `Follow this live match from ${t.name} in real time.`,
    robots: { index: false }, // don't index transient match pages
  };
}

export default async function PublicMatchPage({ params }: Props) {
  const { slug, matchId } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();
  const { data: matchState, error } = await supabase.rpc('get_public_match_state', {
    p_match_id: matchId,
  });

  if (error || !matchState) {
    return (
      <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
        <div className="py-16 text-center">
          <p className="mb-2 text-lg font-bold">Match Not Available</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            This match may not exist or is not publicly accessible.
          </p>
          <Link
            href={`/t/${slug}/fixtures`}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
            style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}
          >
            ← View Fixtures
          </Link>
        </div>
      </PublicTournamentFrame>
    );
  }

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href={`/t/${slug}/fixtures`}
          className="inline-flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          <CalendarDays className="h-4 w-4" />
          All fixtures
        </Link>
        <Link
          href={`/t/${slug}/match/${matchId}/tv`}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
          style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.2)' }}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open TV/projector scoreboard in new tab"
        >
          📺 TV View
        </Link>
      </div>
      <PublicMatchLive matchId={matchId} initialState={matchState as never} />
    </PublicTournamentFrame>
  );
}
