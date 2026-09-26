import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { TournamentNotFound } from '@/components/public/TournamentNotFound';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import type { PublicLotState } from '@/lib/lot-draw';
import { PublicLotLive } from './PublicLotLive';
import { PublicAuctionLive } from './PublicAuctionLive';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import type { Metadata } from 'next';
import { Radio, CalendarDays } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'live');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Live';
  const canonical = new URL(`/t/${slug}/live`, TOURNY_PRODUCTION_ORIGIN);
  return {
    ...meta,
    title: { absolute: title },
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      ...meta.openGraph,
      title: { absolute: title },
      url: canonical,
      siteName: 'Tourny',
    },
  };
}

export default async function PublicLivePage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();
  const isAuctionLeague = tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  // ── 1. Auction Live (highest priority during PREPARATION/AUCTION phase) ────
  if (isAuctionLeague) {
    const { data: latestAuctionEvent } = await supabase
      .from('auction_public_events')
      .select('auction_id, created_at')
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAuctionEvent?.auction_id) {
      const { data: auctionState, error } = await supabase.rpc('get_auction_public_state', {
        p_auction_id: latestAuctionEvent.auction_id,
      });
      if (!error && auctionState) {
        return (
          <PublicTournamentFrame
            slug={slug}
            name={tournament.name}
            logoUrl={tournament.logoUrl}
            status={tournament.status}
          >
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>
                Auction
              </p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Live Auction</h1>
            </div>
            <PublicAuctionLive
              auctionId={latestAuctionEvent.auction_id}
              initialState={auctionState as never}
            />
          </PublicTournamentFrame>
        );
      }
    }
  }

  // ── 2. Live Matches ────────────────────────────────────────────────────────
  const { data: liveMatches } = await supabase
    .from('public_fixture_view')
    .select('id,match_number,home_team_id,away_team_id,status,venue,court')
    .eq('tournament_id', tournament.id)
    .eq('status', 'LIVE');

  const matchTeamIds = [...new Set(
    (liveMatches ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]).filter(Boolean)
  )];
  const { data: matchTeams } = matchTeamIds.length
    ? await supabase.from('public_team_view').select('id,name,short_name').in('id', matchTeamIds)
    : { data: [] };

  const teamName = (id: string | null) => matchTeams?.find((t) => t.id === id)?.name ?? 'TBD';

  // ── 3. Lot Draw fallback ───────────────────────────────────────────────────
  const { data: events } = await supabase
    .from('lot_public_events')
    .select('lot_session_id, lot_type, created_at')
    .eq('tournament_id', tournament.id)
    .order('created_at', { ascending: false })
    .limit(50);

  let lotState: PublicLotState | null = null;
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

  lotState =
    snapshots.find((s) => s && ['PREPARING', 'SHUFFLED', 'LIVE'].includes(s.session.status)) ??
    snapshots.find((s) => s?.session.status === 'COMPLETED') ??
    null;

  const { data: teams } = await supabase
    .from('public_team_view')
    .select('id, name, short_name')
    .eq('tournament_id', tournament.id);

  const safeTeams = (teams ?? []).filter(
    (t): t is { id: string; name: string; short_name: string | null } => Boolean(t.id && t.name)
  );

  const hasLiveMatches = (liveMatches?.length ?? 0) > 0;
  const hasLotState = Boolean(lotState);

  return (
    <PublicTournamentFrame
      slug={slug}
      name={tournament.name}
      logoUrl={tournament.logoUrl}
      status={tournament.status}
    >
      {/* Live matches section */}
      {hasLiveMatches && (
        <section className="mb-10">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>
              Playing now
            </p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Live Matches</h1>
          </div>
          <div className="space-y-3">
            {liveMatches!.map((match) => (
              <Link
                key={match.id}
                href={`/t/${slug}/match/${match.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl p-5 transition-colors"
                style={{
                  background: 'rgba(239,68,68,0.07)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <div>
                  <p className="text-xs font-bold uppercase" style={{ color: '#f87171' }}>
                    ● Live · Match {match.match_number ?? '—'}
                  </p>
                  <p className="mt-1 font-bold text-sm">
                    {teamName(match.home_team_id)} <span style={{ color: 'rgba(255,255,255,0.3)' }}>vs</span> {teamName(match.away_team_id)}
                  </p>
                  {(match.venue || match.court) && (
                    <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {[match.venue, match.court].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Watch →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Lot Draw section */}
      {hasLotState && (
        <section>
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>
              Lot draw
            </p>
            {!hasLiveMatches && <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Live Lot Draw</h1>}
          </div>
          <PublicLotLive
            tournament={tournament as { id: string; name: string; slug: string }}
            teams={safeTeams}
            initialState={lotState}
          />
        </section>
      )}

      {/* Nothing live */}
      {!hasLiveMatches && !hasLotState && (
        <div className="py-16 text-center">
          <Radio className="mx-auto mb-4 h-10 w-10" style={{ color: 'rgba(99,102,241,0.5)' }} />
          <h1 className="text-2xl font-bold">Nothing Live Right Now</h1>
          <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            Live matches, auction, and lot draw will appear here when they start.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`/t/${slug}/fixtures`}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
              style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
            >
              <CalendarDays className="h-4 w-4" />
              View Fixtures
            </Link>
          </div>
        </div>
      )}
    </PublicTournamentFrame>
  );
}
