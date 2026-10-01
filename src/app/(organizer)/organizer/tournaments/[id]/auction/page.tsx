
import { createClient } from '@/lib/supabase/server';
import { getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Suspense } from 'react';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';
import { OrganizerAuctionClient } from './OrganizerAuctionClient';
import type { OrganizerAuctionSnapshot } from '@/lib/organizer/organizer-auction';

export const dynamic = 'force-dynamic';

function AuctionSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-32 w-full rounded-2xl bg-surface-muted" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 h-64 rounded-2xl bg-surface-muted" />
        <div className="h-64 rounded-2xl bg-surface-muted" />
      </div>
    </div>
  );
}

async function AuctionContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: tournament } = await getTournament(id);

  if (!tournament) notFound();

  const isAuctionLeague =
    tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  if (!isAuctionLeague) {
    return (
      <main className="mx-auto max-w-4xl p-6 md:p-10">
        <div className="rounded-2xl border border-border bg-surface p-8">
          <h1 className="text-2xl font-bold text-text-primary">Auction is not configured</h1>
          <p className="mt-2 text-text-secondary">
            This tournament is not in Auction League mode. Update tournament settings to enable the
            auction.
          </p>
          <Link
            href={`/organizer/tournaments/${id}/settings`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Go to Settings
          </Link>
        </div>
      </main>
    );
  }

  const supabase = await createClient();

  // Fetch auction (if it exists)
  const { data: auctionRow } = await supabase
    .from('auctions')
    .select('id,status')
    .eq('tournament_id', id)
    .maybeSingle();

  let snapshot: OrganizerAuctionSnapshot | null = null;

  if (auctionRow?.id) {
    const { data: snapshotData } = await supabase.rpc('get_auction_organizer_state', {
      p_auction_id: auctionRow.id,
    });
    if (snapshotData) {
      snapshot = snapshotData as unknown as OrganizerAuctionSnapshot;
    }
  }

  // Also fetch readiness when no auction exists yet (DRAFT state)
  let readiness = snapshot?.readiness ?? null;
  if (!snapshot) {
    const { data: readinessData } = await supabase.rpc('get_auction_readiness', {
      p_tournament_id: id,
    });
    readiness = readinessData as typeof readiness;
  }

  // Fetch auction categories for display
  const { data: categoriesData } = await supabase
    .from('tournament_auction_categories')
    .select('id,category_code,display_name,base_price,display_order')
    .eq('tournament_id', id)
    .order('display_order');

  const categories = (categoriesData ?? []).map((c) => ({
    id: c.id as string,
    code: c.category_code as 'A' | 'B' | 'C',
    display_name: c.display_name as string,
    base_price: c.base_price as number,
    display_order: c.display_order as number,
  }));

  // Fetch team names for wallet monitor
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id,name,short_name')
    .eq('tournament_id', id)
    .eq('status', 'ACTIVE');

  const teamNameMap: Record<string, { name: string; short_name: string | null }> = {};
  for (const t of teamsData ?? []) {
    teamNameMap[t.id as string] = {
      name: t.name as string,
      short_name: t.short_name as string | null,
    };
  }

  // Fetch player display names for the queue (used in unsold player list)
  // Only needed when auction exists and has a queue
  const playerNameMap: Record<string, string> = {};
  if (snapshot?.queue && snapshot.queue.length > 0) {
    const playerIds = [...new Set(snapshot.queue.map((q) => q.player_id))];
    const { data: profilesData } = await supabase
      .from('player_profiles')
      .select('id,display_name')
      .in('id', playerIds);

    for (const p of profilesData ?? []) {
      playerNameMap[p.id as string] = p.display_name as string;
    }
  }

  // Fetch tournament settings for reauction_price_rule
  const { data: settingsData } = await supabase
    .from('tournament_settings')
    .select('reauction_price_rule')
    .eq('tournament_id', id)
    .maybeSingle();

  const reauctionPriceRule =
    (settingsData?.reauction_price_rule as string | null) ?? 'SAME_BASE_PRICE';
  const minimumBidIncrement = 100;

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/organizer/tournaments/${id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Tournament
          <OrganizerLinkPending />
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Auction Control</h1>
        <p className="mt-1 text-text-secondary">{tournament.name as string}</p>
      </div>

      <OrganizerAuctionClient
        tournamentId={id}
        tournamentName={tournament.name as string}
        auctionId={auctionRow?.id ?? null}
        initialSnapshot={snapshot}
        initialReadiness={readiness}
        categories={categories}
        teamNameMap={teamNameMap}
        playerNameMap={playerNameMap}
        reauctionPriceRule={reauctionPriceRule}
        minimumBidIncrement={minimumBidIncrement}
      />
    </main>
  );
}

export default function OrganizerAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<AuctionPageSkeleton />}>
      <AuctionContent params={params} />
    </Suspense>
  );
}

function AuctionPageSkeleton() {
  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8" aria-label="Loading auction control">
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="space-y-2">
          <div className="h-9 w-56 rounded-lg bg-surface-muted" />
          <div className="h-4 w-48 rounded bg-surface-muted" />
        </div>
        <AuctionSkeleton />
      </div>
    </main>
  );
}
