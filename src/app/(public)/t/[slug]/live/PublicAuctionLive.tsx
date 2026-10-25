'use client';

/**
 * PublicAuctionLive — Phase 5C Module C
 *
 * Public/spectator live auction view.
 * - Reads ONLY from get_auction_public_state (safe projection, anon-accessible)
 * - Realtime via auction_public_events ONLY (not raw tables)
 * - Events trigger authoritative snapshot refresh — never treated as financial truth
 * - Handles all auction statuses: READY / LIVE / PAUSED / COMPLETED
 * - SOLD / UNSOLD transition animations
 * - Sequence tracking for missed-event detection
 * - Visibility / online recovery
 * - Mobile-first, 320px+
 *
 * SECURITY: No wallet, bid table, purse_transactions, or reserve data is
 * exposed or queried here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Radio, Wifi, WifiOff, RefreshCcw, Clock, Trophy, Pause, Maximize2, Minimize2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuctionPlayerCard } from '@/components/auction/AuctionPlayerCard';

function CurrentPlayerCard(props: {
  player: PublicCurrentPlayer;
  highestBid: PublicBid | null;
  recentBidsCount?: number;
  supabase: ReturnType<typeof createClient>;
  isFullscreen?: boolean;
  tournamentName?: string;
  tournamentLogoUrl?: string | null;
}) {
  return <AuctionPlayerCard {...props} />;
}

// ─── Types (mirrors get_auction_public_state output) ─────────────────────────

type AuctionStatus = 'READY' | 'LIVE' | 'PAUSED' | 'COMPLETED' | string;

interface PublicTeam {
  id: string;
  name: string;
  short_name: string | null;
  logo_path: string | null;
}

interface PublicBid {
  id: string;
  amount: number;
  created_at: string;
  team: PublicTeam;
}

interface PublicCurrentPlayer {
  auction_player_id: string;
  base_price: number;
  category_code: string | null;
  category_label: string | null;
  category_base_price: number | null;
  attempt_number: number;
  auction_order?: number;
  state_version: number;
  player: {
    id: string;
    display_name: string;
    photo_path: string | null;
    primary_position: string | null;
    secondary_position: string | null;
    phone?: string | null;
  };
}

interface PublicAuctionState {
  auction: {
    id: string;
    tournament_id: string;
    status: AuctionStatus;
    state_version: number;
  };
  current_player: PublicCurrentPlayer | null;
  highest_bid: PublicBid | null;
  recent_bids: PublicBid[];
  progress: {
    waiting: number;
    sold: number;
    unsold: number;
  };
  last_sequence: number;
}

// ─── Helper: format currency ──────────────────────────────────────────────────

function formatMoney(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `₹${Math.max(0, amount).toLocaleString('en-IN')}`;
}

// ─── Connection badge ─────────────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: 'connecting' | 'live' | 'reconnecting' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wider
        ${status === 'live'
          ? 'border-success/30 bg-success/10 text-success'
          : status === 'reconnecting'
            ? 'border-warning/30 bg-warning/10 text-warning'
            : 'border-border bg-surface text-text-muted'}`}
      role="status"
      aria-live="polite"
      aria-label={`Realtime connection: ${status}`}
    >
      {status === 'live' ? (
        <Wifi className="h-3 w-3" aria-hidden="true" />
      ) : status === 'reconnecting' ? (
        <RefreshCcw className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <WifiOff className="h-3 w-3" aria-hidden="true" />
      )}
      {status === 'live' ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'}
    </span>
  );
}

// ─── Auction status chip ──────────────────────────────────────────────────────

function AuctionStatusChip({ status }: { status: AuctionStatus }) {
  const cfg: Record<string, { label: string; cls: string; dotCls: string }> = {
    READY: { label: 'Ready to Start', cls: 'border-info/30 bg-info/10 text-info', dotCls: 'bg-info' },
    LIVE: { label: 'Live', cls: 'border-danger/30 bg-danger/10 text-danger', dotCls: 'bg-danger animate-pulse' },
    PAUSED: { label: 'Paused', cls: 'border-warning/30 bg-warning/10 text-warning', dotCls: 'bg-warning' },
    COMPLETED: { label: 'Completed', cls: 'border-success/30 bg-success/10 text-success', dotCls: 'bg-success' },
  };
  const c = cfg[status] ?? { label: status, cls: 'border-border bg-surface text-text-secondary', dotCls: 'bg-surface-muted' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${c.cls}`}>
      <span className={`h-2 w-2 rounded-full shrink-0 ${c.dotCls}`} />
      {c.label}
    </span>
  );
}

// ─── Progress pills ───────────────────────────────────────────────────────────

function ProgressStats({ progress }: { progress: PublicAuctionState['progress'] }) {
  const total = (progress.waiting ?? 0) + (progress.sold ?? 0) + (progress.unsold ?? 0);
  const done = (progress.sold ?? 0) + (progress.unsold ?? 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
        <span>{done} of {total} resolved</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <motion.div
          className="h-full rounded-full bg-success"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([
          ['Sold', progress.sold, 'text-success', 'bg-success/10 border-success/30'],
          ['Unsold', progress.unsold, 'text-text-secondary', 'bg-surface border-border'],
          ['Waiting', progress.waiting, 'text-info', 'bg-info/10 border-info/30'],
        ] as const).map(([label, value, textCls, bgCls]) => (
          <div key={label} className={`rounded-xl border p-3 text-center ${bgCls}`}>
            <p className={`text-xl font-black ${textCls}`}>{value ?? 0}</p>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent bids feed ─────────────────────────────────────────────────────────

function RecentBidsFeed({ bids }: { bids: PublicBid[] }) {
  if (!bids || bids.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface-muted p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-muted">
        Recent Bids
      </h3>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {bids.slice(0, 12).map((bid, i) => (
          <div key={bid.id ?? i} className="flex items-center justify-between rounded-lg px-3 py-2 bg-surface">
            <span className="truncate text-sm text-text-secondary mr-3">
              {bid.team.short_name ?? bid.team.name}
            </span>
            <span className="shrink-0 text-sm font-bold text-success">
              {formatMoney(bid.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Idle / no active player state ───────────────────────────────────────────

function IdleState({ status, progress }: { status: AuctionStatus; progress: PublicAuctionState['progress'] }) {
  if (status === 'PAUSED') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-warning/30 bg-warning/10 py-14 text-center">
        <Pause className="mb-3 h-10 w-10 text-warning" aria-hidden="true" />
        <h2 className="text-xl font-bold text-text-secondary">Auction Paused</h2>
        <p className="mt-2 text-sm text-text-muted">The auction is temporarily paused. Resuming soon.</p>
      </div>
    );
  }
  if (status === 'READY') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-info/30 bg-info/10 py-14 text-center">
        <Clock className="mb-3 h-10 w-10 text-info" aria-hidden="true" />
        <h2 className="text-xl font-bold text-text-secondary">Starting Soon</h2>
        <p className="mt-2 text-sm text-text-muted">The auction is prepared and ready to begin.</p>
      </div>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-success/30 bg-success/10 py-14 text-center">
        <Trophy className="mb-3 h-10 w-10 text-success" aria-hidden="true" />
        <h2 className="text-xl font-bold text-text-secondary">Auction Complete</h2>
        <p className="mt-2 text-sm text-text-muted">
          {progress.sold} player{progress.sold !== 1 ? 's' : ''} sold · {progress.unsold} unsold
        </p>
      </div>
    );
  }
  // LIVE but no player currently open
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface py-14 text-center">
      <Radio className="mb-3 h-10 w-10 text-primary/50 animate-pulse" aria-hidden="true" />
      <h2 className="text-xl font-bold text-text-secondary">Auction is Live</h2>
      <p className="mt-2 text-sm text-text-muted">Waiting for the next player to be opened…</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  auctionId: string;
  initialState: PublicAuctionState;
  tournamentName?: string;
  tournamentLogoUrl?: string | null;
}

export function PublicAuctionLive({ auctionId, initialState, tournamentName, tournamentLogoUrl }: Props) {
  const [state, setState] = useState<PublicAuctionState>(initialState);
  const [conn, setConn] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSeqRef = useRef<number>(initialState.last_sequence ?? 0);
  const supabase = useMemo(() => createClient(), []);
  const reduceMotion = useReducedMotion();

  // Fullscreen change listener
  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // ── Snapshot refresh ─────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_auction_public_state', {
      p_auction_id: auctionId,
    });
    if (!error && data) {
      const next = data as unknown as PublicAuctionState;
      setState(next);
      lastSeqRef.current = next.last_sequence ?? lastSeqRef.current;
      setConn('live');
    }
  }, [auctionId, supabase]);

  // ── Realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`public-auction-${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'auction_public_events',
          filter: `auction_id=eq.${auctionId}`,
        },
        (msg) => {
          const row = msg.new as { sequence_number?: number };
          const seq = Number(row.sequence_number ?? 0);
          // Detect missed events (gap in sequence)
          if (lastSeqRef.current && seq > lastSeqRef.current + 1) {
            setConn('reconnecting');
          }
          lastSeqRef.current = Math.max(lastSeqRef.current, seq);
          // Always refresh authoritatively — never trust event payload as truth
          void refresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConn('live');
          void refresh(); // Re-sync on (re)connect
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConn('reconnecting');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [auctionId, refresh, supabase]);

  // ── Visibility / online recovery ─────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onOnline = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  const { auction, current_player, highest_bid, recent_bids, progress } = state;

  return (
    <section ref={containerRef} aria-label="Live Auction" className={`space-y-5 ${isFullscreen ? 'bg-background p-6 min-h-screen flex flex-col justify-center items-center overflow-auto' : 'mt-6'}`}>
      {/* ── Header bar ── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-4 ${isFullscreen ? 'w-full max-w-5xl' : ''}`}>
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-info shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-secondary">
              Live Auction Stage
            </p>
            <div className="mt-1">
              <AuctionStatusChip status={auction.status} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge status={conn} />
          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-2 rounded-xl border border-info/30 bg-info/10 px-3.5 py-2 text-xs font-bold text-info transition-all hover:bg-info/15 hover:border-info/30 active:scale-95 shadow-sm"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (Projector View)'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                <span>Fullscreen Stage</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main content: desktop two-column, mobile stacked (or centered when fullscreen) ── */}
      <div className={`grid grid-cols-1 gap-6 ${isFullscreen ? 'w-full max-w-5xl' : 'lg:grid-cols-12'}`}>
        {/* Left / main stage card area */}
        <div className={`space-y-5 ${isFullscreen ? 'w-full' : 'lg:col-span-8'}`}>
          <AnimatePresence mode="wait">
            {current_player ? (
              <CurrentPlayerCard
                key={current_player.auction_player_id}
                player={current_player}
                highestBid={highest_bid}
                recentBidsCount={recent_bids?.length ?? 0}
                supabase={supabase}
                isFullscreen={true}
                tournamentName={tournamentName}
                tournamentLogoUrl={tournamentLogoUrl}
              />
            ) : (
              <motion.div
                key={`idle-${auction.status}`}
                initial={!reduceMotion ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={!reduceMotion ? { opacity: 0 } : undefined}
              >
                <IdleState status={auction.status} progress={progress} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Recent bids — shown below card if not in fullscreen */}
          {!isFullscreen && current_player && recent_bids && recent_bids.length > 0 && (
            <RecentBidsFeed bids={recent_bids} />
          )}
        </div>

        {/* Right sidebar (hidden in fullscreen projector mode) */}
        {!isFullscreen && (
          <div className="space-y-5 lg:col-span-4">
            {/* Progress */}
            <div className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-text-muted">
                Auction Progress
              </h3>
              <ProgressStats progress={progress} />
            </div>

            {/* Leading team highlight — on sidebar for desktop, already shown in player card on mobile */}
            {current_player && highest_bid && (
              <div className="rounded-2xl border border-success/30 bg-success/10 p-5">
                <p className="text-xs font-bold uppercase tracking-wider text-success">
                  Leading Team
                </p>
                <p className="mt-2 text-xl font-black text-text-primary truncate">
                  {highest_bid.team.name}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-success">
                  {formatMoney(highest_bid.amount)}
                </p>
              </div>
            )}

            {/* No current player but LIVE — show waiting count */}
            {!current_player && auction.status === 'LIVE' && progress.waiting > 0 && (
              <div className="rounded-2xl border border-info/30 bg-info/10 p-5 text-center">
                <p className="text-3xl font-black text-info">{progress.waiting}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-text-muted">
                  Players Waiting
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}