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
import { Radio, Wifi, WifiOff, RefreshCcw, Clock, Trophy, Pause, Maximize2, Minimize2, User, Hand, Award, Phone, Gavel, Shield } from 'lucide-react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import { AuctionPlayerCard } from '@/components/auction/AuctionPlayerCard';

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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider
        ${status === 'live'
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400'
          : status === 'reconnecting'
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-400'
            : 'border-white/10 bg-white/5 text-white/40'}`}
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
    READY: { label: 'Ready to Start', cls: 'border-blue-400/30 bg-blue-400/10 text-blue-300', dotCls: 'bg-blue-400' },
    LIVE: { label: 'Live', cls: 'border-red-400/30 bg-red-400/10 text-red-400', dotCls: 'bg-red-400 animate-pulse' },
    PAUSED: { label: 'Paused', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300', dotCls: 'bg-amber-400' },
    COMPLETED: { label: 'Completed', cls: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300', dotCls: 'bg-emerald-400' },
  };
  const c = cfg[status] ?? { label: status, cls: 'border-white/10 bg-white/5 text-white/60', dotCls: 'bg-white/40' };
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
      <div className="mb-2 flex items-center justify-between text-xs text-white/40">
        <span>{done} of {total} resolved</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-emerald-400"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {([
          ['Sold', progress.sold, 'text-emerald-400', 'bg-emerald-400/10 border-emerald-400/20'],
          ['Unsold', progress.unsold, 'text-white/50', 'bg-white/5 border-white/10'],
          ['Waiting', progress.waiting, 'text-blue-300', 'bg-blue-400/10 border-blue-400/20'],
        ] as const).map(([label, value, textCls, bgCls]) => (
          <div key={label} className={`rounded-xl border p-3 text-center ${bgCls}`}>
            <p className={`text-xl font-black ${textCls}`}>{value ?? 0}</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Player photo ─────────────────────────────────────────────────────────────

function PlayerPhoto({ player, supabase, isFullscreen }: {
  player: PublicCurrentPlayer['player'];
  supabase: ReturnType<typeof createClient>;
  isFullscreen?: boolean;
}) {
  const url = resolvePublicStorageUrl(supabase as any, 'avatars', player.photo_path);
  const initial = player.display_name.trim().charAt(0).toUpperCase();

  return (
    <div
      className={`relative mx-auto shrink-0 overflow-hidden rounded-3xl border-4 border-[#e5a93c]/60 bg-gradient-to-tr from-[#1a1409] via-[#2c200b] to-[#0c0d14] shadow-[0_0_50px_rgba(229,169,60,0.4)] flex items-center justify-center group transition-all duration-300
        ${isFullscreen ? 'h-64 w-64 sm:h-80 sm:w-80' : 'h-56 w-56 sm:h-64 sm:w-64'}`}
    >
      {url ? (
        <Image
          src={url}
          alt={player.display_name}
          fill
          unoptimized
          className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
          sizes="320px"
        />
      ) : (
        <span className="text-8xl font-black tracking-widest text-[#e5a93c] drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)]">
          {initial}
        </span>
      )}
    </div>
  );
}

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

// ─── Recent bids feed ─────────────────────────────────────────────────────────

function RecentBidsFeed({ bids }: { bids: PublicBid[] }) {
  if (!bids || bids.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-white/40">
        Recent Bids
      </h3>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {bids.slice(0, 12).map((bid, i) => (
          <div key={bid.id ?? i} className="flex items-center justify-between rounded-lg px-3 py-2 bg-white/[0.03]">
            <span className="truncate text-sm text-white/70 mr-3">
              {bid.team.short_name ?? bid.team.name}
            </span>
            <span className="shrink-0 text-sm font-bold text-emerald-400">
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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-400/5 py-14 text-center">
        <Pause className="mb-3 h-10 w-10 text-amber-400/50" aria-hidden="true" />
        <h2 className="text-xl font-bold text-white/80">Auction Paused</h2>
        <p className="mt-2 text-sm text-white/45">The auction is temporarily paused. Resuming soon.</p>
      </div>
    );
  }
  if (status === 'READY') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-400/5 py-14 text-center">
        <Clock className="mb-3 h-10 w-10 text-blue-400/50" aria-hidden="true" />
        <h2 className="text-xl font-bold text-white/80">Starting Soon</h2>
        <p className="mt-2 text-sm text-white/45">The auction is prepared and ready to begin.</p>
      </div>
    );
  }
  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/5 py-14 text-center">
        <Trophy className="mb-3 h-10 w-10 text-emerald-400/60" aria-hidden="true" />
        <h2 className="text-xl font-bold text-white/80">Auction Complete</h2>
        <p className="mt-2 text-sm text-white/45">
          {progress.sold} player{progress.sold !== 1 ? 's' : ''} sold · {progress.unsold} unsold
        </p>
      </div>
    );
  }
  // LIVE but no player currently open
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-14 text-center">
      <Radio className="mb-3 h-10 w-10 text-primary/50 animate-pulse" aria-hidden="true" />
      <h2 className="text-xl font-bold text-white/80">Auction is Live</h2>
      <p className="mt-2 text-sm text-white/45">Waiting for the next player to be opened…</p>
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
    <section ref={containerRef} aria-label="Live Auction" className={`space-y-5 ${isFullscreen ? 'bg-[#030718] p-6 min-h-screen flex flex-col justify-center items-center overflow-auto' : 'mt-6'}`}>
      {/* ── Header bar ── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 ${isFullscreen ? 'w-full max-w-5xl' : ''}`}>
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-cyan-400 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
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
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-bold text-cyan-300 transition-all hover:bg-cyan-500/20 hover:border-cyan-400/60 active:scale-95 shadow-sm"
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
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-4 text-[11px] font-bold uppercase tracking-wider text-white/40">
                Auction Progress
              </h3>
              <ProgressStats progress={progress} />
            </div>

            {/* Leading team highlight — on sidebar for desktop, already shown in player card on mobile */}
            {current_player && highest_bid && (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/60">
                  Leading Team
                </p>
                <p className="mt-2 text-xl font-black text-white truncate">
                  {highest_bid.team.name}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-emerald-400">
                  {formatMoney(highest_bid.amount)}
                </p>
              </div>
            )}

            {/* No current player but LIVE — show waiting count */}
            {!current_player && auction.status === 'LIVE' && progress.waiting > 0 && (
              <div className="rounded-2xl border border-blue-400/20 bg-blue-400/5 p-5 text-center">
                <p className="text-3xl font-black text-blue-300">{progress.waiting}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-white/40">
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