import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import type { PublicLotState } from '@/lib/lot-draw';
import { PublicLotLive } from './PublicLotLive';
import { PublicAuctionLive } from './PublicAuctionLive';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: t } = await supabase
    .from('tournaments')
    .select('name')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  return {
    title: t?.name ? `${t.name} — Live` : 'Live Tournament',
    description: 'Follow the live auction and lot draw in real time.',
  };
}

export default async function PublicLivePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  // Only read from public tournaments
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, format, league_mode')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#09090e] text-white">
        <PublicLandingNav />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Tournament Not Found</h1>
          <p className="mt-3 text-white/50">This tournament is private or does not exist.</p>
          <Link href="/" className="mt-6 inline-block text-sm text-primary hover:underline">
            ← Back to Tourny
          </Link>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const isAuctionLeague =
    tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  // ── Check for auction first (LIVE, PAUSED, READY, or COMPLETED) ──────────
  // Include READY so spectators can see "Starting soon" state.
  // Include COMPLETED so the final state is visible after it ends.
  if (isAuctionLeague) {
    // M25 intentionally keeps the raw auctions table private from anon users.
    // Discover the auction through its sanitized public event stream, then let
    // get_auction_public_state enforce public/member visibility authoritatively.
    const { data: latestAuctionEvent } = await supabase
      .from('auction_public_events')
      .select('auction_id, created_at')
      .eq('tournament_id', tournament.id as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAuctionEvent?.auction_id) {
      const { data: auctionState, error } = await supabase.rpc('get_auction_public_state', {
        p_auction_id: latestAuctionEvent.auction_id,
      });
      if (!error && auctionState) {
        return (
          <div className="min-h-screen bg-[#09090e] text-white">
            <PublicLandingNav />
            <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
              <Link
                href={`/t/${slug}`}
                className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
              >
                ← {tournament.name}
              </Link>
              <PublicAuctionLive
                auctionId={latestAuctionEvent.auction_id}
                initialState={auctionState as never}
              />
            </main>
            <LandingFooter />
          </div>
        );
      }
    }
  }

  // ── Fall back to Lot Draw live view ──────────────────────────────────────
  const { data: events } = await supabase
    .from('lot_public_events')
    .select('lot_session_id, lot_type, created_at')
    .eq('tournament_id', tournament.id as string)
    .order('created_at', { ascending: false })
    .limit(50);

  let initialState: PublicLotState | null = null;
  const latestSessionIds = [
    ...new Set((events ?? []).map((e) => e.lot_session_id)),
  ].slice(0, 4);

  const snapshots = await Promise.all(
    latestSessionIds.map(async (sessionId) => {
      const { data } = await supabase.rpc('get_lot_public_state', {
        p_lot_session_id: sessionId,
      });
      return data as unknown as PublicLotState | null;
    })
  );

  initialState =
    snapshots.find(
      (s) => s && ['PREPARING', 'SHUFFLED', 'LIVE'].includes(s.session.status)
    ) ??
    snapshots.find((s) => s?.session.status === 'COMPLETED') ??
    null;

  const { data: teams } = await supabase
    .from('public_team_view')
    .select('id, name, short_name')
    .eq('tournament_id', tournament.id as string);

  const safeTeams = (teams ?? []).filter(
    (t): t is { id: string; name: string; short_name: string | null } =>
      Boolean(t.id && t.name)
  );

  return (
    <div className="min-h-screen bg-[#09090e] text-white">
      <PublicLandingNav />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Link
          href={`/t/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white transition-colors"
        >
          ← {tournament.name}
        </Link>
        <PublicLotLive
          tournament={tournament as { id: string; name: string; slug: string }}
          teams={safeTeams}
          initialState={initialState}
        />
      </main>
      <LandingFooter />
    </div>
  );
}
