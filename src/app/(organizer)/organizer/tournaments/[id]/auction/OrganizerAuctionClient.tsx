'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import {
  WifiIcon,
  WifiOff,
  RefreshCcw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  SkipForward,
  DollarSign,
  XCircle,
  RotateCcw,
  Trophy,
  Users,
  List,
  UserPlus
} from 'lucide-react';
import { AuctionPlayerCard } from '@/components/auction/AuctionPlayerCard';
import { createClient } from '@/lib/supabase/client';
import { OrganizerAddPlayerModal } from '@/components/organizer/OrganizerAddPlayerModal';
import Image from 'next/image';
import {
  formatMoney,
  auctionStatusLabel,
  safeAuctionError,
  availableActions,
  blockerMessage,
  type OrganizerAuctionSnapshot,
  type AuctionStatus,
  type ReadinessResult,
} from '@/lib/organizer/organizer-auction';
import {
  prepareAuctionAction,
  setAuctionLifecycleAction,
  openNextAuctionPlayerAction,
  finalizeAuctionSaleAction,
  markAuctionPlayerUnsoldAction,
  requeueAuctionPlayerAction,
  completeAuctionAction,
} from '@/app/actions/auction';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';


// ─── Confirmation modal ───────────────────────────────────────────────────────

function ConfirmModal({
  title,
  description,
  confirmLabel,
  confirmClass,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
      >
        <h2 id="confirm-title" className="text-lg font-bold text-text-primary">{title}</h2>
        <p id="confirm-desc" className="mt-2 text-sm text-text-secondary">{description}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-10 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${confirmClass ?? 'bg-primary hover:bg-primary-hover'}`}
          >
            {busy ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: AuctionStatus }) {
  const cfg: Record<AuctionStatus, { cls: string; dot: string }> = {
    DRAFT: { cls: 'bg-slate-500/15 text-slate-500', dot: 'bg-slate-500' },
    READY: { cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400', dot: 'bg-blue-500' },
    LIVE: { cls: 'bg-live/15 text-live', dot: 'bg-live animate-pulse' },
    PAUSED: { cls: 'bg-warning/15 text-warning', dot: 'bg-warning' },
    COMPLETED: { cls: 'bg-success/15 text-success', dot: 'bg-success' },
  };
  const { cls, dot } = cfg[status] ?? cfg.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${cls}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {auctionStatusLabel(status)}
    </span>
  );
}

// ─── Connection badge ─────────────────────────────────────────────────────────

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${connected ? 'bg-success/10 text-success' : 'bg-offline/15 text-offline'
      }`}>
      {connected ? <WifiIcon className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      {connected ? 'Connected' : 'Reconnecting…'}
    </span>
  );
}

// ─── Readiness panel ──────────────────────────────────────────────────────────

function ReadinessPanel({ readiness }: { readiness: ReadinessResult | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!readiness) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          {readiness.ready ? (
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          )}
          <div className="text-left">
            <h3 className="font-semibold text-text-primary">
              {readiness.ready ? 'Auction Ready' : `${readiness.blockers.length} Blocker${readiness.blockers.length !== 1 ? 's' : ''}`}
            </h3>
            <p className="text-xs text-text-secondary">
              {readiness.active_teams} team{readiness.active_teams !== 1 ? 's' : ''} · {readiness.eligible_players} eligible player{readiness.eligible_players !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {!readiness.ready && (
          expanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>

      <AnimatePresence>
        {expanded && !readiness.ready && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2 overflow-hidden"
          >
            {readiness.blockers.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-danger">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{blockerMessage(b)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Current player panel ─────────────────────────────────────────────────────

function CurrentPlayerPanel({
  snapshot,
  storageBase,
  tournamentName,
}: {
  snapshot: OrganizerAuctionSnapshot;
  storageBase: string;
  tournamentName?: string;
}) {
  const cp = snapshot.current_player;
  const hb = snapshot.highest_bid;

  if (!cp) {
    const waiting = snapshot.progress.waiting;
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-glass-border bg-surface-raised/40 backdrop-blur-xl py-20 text-center shadow-xl">
        {waiting > 0 ? (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 animate-pulse">
              <Clock className="h-8 w-8" />
            </div>
            <p className="text-xl font-bold text-text-primary tracking-tight">No Player Currently On Stage</p>
            <p className="mt-1.5 text-sm text-text-secondary font-medium">{waiting} player{waiting !== 1 ? 's' : ''} waiting in queue</p>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 mb-4">
              <Trophy className="h-8 w-8" />
            </div>
            <p className="text-xl font-bold text-text-primary tracking-tight">Auction Queue Complete!</p>
            <p className="mt-1.5 text-sm text-text-secondary font-medium">All players have been resolved.</p>
          </>
        )}
      </div>
    );
  }

  const photoUrl = cp.player.photo_path
    ? `${storageBase}/avatars/${cp.player.photo_path}`
    : null;

  return (
    <AuctionPlayerCard
      player={cp}
      highestBid={hb}
      supabase={createClient()}
      tournamentName={tournamentName}
      currentlyBiddingTeamName={hb ? (hb.team.short_name ?? hb.team.name) : '—'}
    />
  );
}

// ─── Auctioneer Bidding Panel ───────────────────────────────────────────────────

function AuctioneerBiddingPanel({
  snapshot,
  teamNameMap,
  onPlaceBid,
  busy,
  minimumBidIncrement,
}: {
  snapshot: OrganizerAuctionSnapshot;
  teamNameMap: Record<string, { name: string; short_name: string | null }>;
  onPlaceBid: (teamId: string, amount: number) => void;
  busy: boolean;
  minimumBidIncrement: number;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const cp = snapshot.current_player;
  const hb = snapshot.highest_bid;
  
  const minRequiredBid = hb ? hb.amount + minimumBidIncrement : (cp?.base_price ?? 0);
  const [customBidInput, setCustomBidInput] = useState<string>('');

  // Update input when current player or highest bid changes
  const effectiveBidAmount = customBidInput.trim() !== '' && !isNaN(Number(customBidInput))
    ? Number(customBidInput)
    : minRequiredBid;

  if (!cp || snapshot.auction.status !== 'LIVE') return null;

  // Sort teams by remaining descending
  const teams = [...(snapshot.teams || [])].sort((a, b) => b.remaining - a.remaining);

  function handleBidSubmit() {
    if (selectedTeam && effectiveBidAmount >= minRequiredBid) {
      onPlaceBid(selectedTeam, effectiveBidAmount);
      setSelectedTeam(null);
      setCustomBidInput('');
    }
  }

  return (
    <div className="rounded-3xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl p-6 shadow-xl relative overflow-hidden group h-full flex flex-col justify-between">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative z-10">
        <h3 className="mb-4 font-semibold text-text-primary flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Enter Offline Bid / Final Sale Price
        </h3>
        
        <div className="mb-5">
          <label className="text-sm font-medium text-text-secondary mb-2 block">Select Winning / Bidding Team</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {teams.map(t => {
              const teamInfo = teamNameMap[t.team_id];
              const displayName = teamInfo?.short_name ?? teamInfo?.name ?? `Team ${t.team_id.substring(0, 6)}`;
              const isSelected = selectedTeam === t.team_id;
              const f = t.finance;
              const maxAllowedBid = f.max_allowed_bid ?? (t.remaining - (f.reserve ?? 0));
              const canAfford = maxAllowedBid >= effectiveBidAmount;
              const squadFull = f.active_squad >= f.maximum_squad;
              const disabled = !canAfford || squadFull;
              
              return (
                <button
                  key={t.team_id}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setSelectedTeam(t.team_id)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary shadow-inner ring-2 ring-primary/40'
                      : disabled
                      ? 'border-border/50 bg-surface-muted/50 text-text-muted opacity-50'
                      : 'border-border bg-surface-muted hover:border-primary/50 text-text-secondary hover:-translate-y-0.5'
                  }`}
                  title={squadFull ? 'Squad full' : !canAfford ? 'Exceeds team maximum allowed bid' : ''}
                >
                  <span className="block truncate text-sm font-bold text-text-primary">{displayName}</span>
                  <span className="block text-[11px] font-semibold text-emerald-400">Max Bid: {formatMoney(maxAllowedBid)}</span>
                </button>
              )
            })}
          </div>
        </div>
        
        <div className="mb-4 space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Bid Amount (Min: ₹{minRequiredBid.toLocaleString('en-IN')})
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-3 text-text-muted font-bold">₹</span>
              <input
                type="number"
                min={minRequiredBid}
                step={1}
                placeholder={`e.g. ${minRequiredBid}`}
                value={customBidInput}
                onChange={(e) => setCustomBidInput(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface-muted py-2.5 pl-8 pr-3 text-lg font-bold text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              type="button"
              onClick={() => setCustomBidInput(String(minRequiredBid + 100))}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-bold text-text-secondary hover:border-primary/50"
            >
              +100
            </button>
            <button
              type="button"
              onClick={() => setCustomBidInput(String(minRequiredBid + 500))}
              className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-bold text-text-secondary hover:border-primary/50"
            >
              +500
            </button>
            {customBidInput !== '' && (
              <button
                type="button"
                onClick={() => setCustomBidInput('')}
                className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-bold text-text-muted hover:text-text-primary"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={!selectedTeam || busy || effectiveBidAmount < minRequiredBid}
            onClick={handleBidSubmit}
            className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary to-primary-hover px-4 py-3 text-base font-bold text-primary-foreground shadow-md transition-all duration-300 hover:shadow-lg hover:shadow-primary/30 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            Submit Bid (₹{effectiveBidAmount.toLocaleString('en-IN')})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Team wallet monitor ──────────────────────────────────────────────────────

function TeamWalletMonitor({
  snapshot,
  teamNameMap,
}: {
  snapshot: OrganizerAuctionSnapshot;
  teamNameMap: Record<string, { name: string; short_name: string | null }>;
}) {
  const teams = snapshot.teams;
  if (!teams || teams.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Team Wallets
        </h3>
        <p className="text-sm text-text-secondary">No team wallets initialized yet.</p>
      </section>
    );
  }

  // Sort by remaining descending for easy monitoring
  const sorted = [...teams].sort((a, b) => b.remaining - a.remaining);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
        <Users className="h-4 w-4" /> Teams
      </h3>
      <div className="space-y-2">
        {sorted.map((t) => {
          const pct = t.starting_purse > 0 ? Math.round((t.spent / t.starting_purse) * 100) : 0;
          const f = t.finance;
          const teamInfo = teamNameMap[t.team_id];
          const displayName = teamInfo?.name ?? `Team ${t.team_id.substring(0, 6)}`;
          const shortName = teamInfo?.short_name ?? null;
          return (
            <div key={t.team_id} className="rounded-xl border border-border bg-surface-muted p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 h-2.5 w-2.5 rounded-full bg-primary/70" />
                  <span className="truncate text-sm font-semibold text-text-primary" title={displayName}>
                    {shortName ?? displayName}
                  </span>
                </div>
                <span className="text-xs text-text-muted whitespace-nowrap">{f.active_squad}/{f.maximum_squad} players</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-text-muted">Rem: <span className="font-semibold text-text-primary">{formatMoney(t.remaining)}</span></span>
                <span className="text-text-muted">Max Bid: <span className="font-bold text-emerald-400">{formatMoney(f.max_allowed_bid ?? (t.remaining - (f.reserve ?? 0)))}</span></span>
              </div>
              {f.active_squad >= f.minimum_squad && f.active_squad < f.maximum_squad && (
                <p className="mt-1 text-[11px] text-success font-semibold">Min squad met ✓</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function AuctionProgress({ snapshot }: { snapshot: OrganizerAuctionSnapshot }) {
  const { waiting, sold, unsold } = snapshot.progress;
  const total = waiting + sold + unsold + (snapshot.current_player ? 1 : 0);
  const done = sold + unsold;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-text-primary">Progress</h3>
        <span className="text-sm font-semibold text-text-secondary">{done}/{total}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex gap-4 flex-wrap text-xs">
        <span className="flex items-center gap-1.5 text-success"><span className="h-2 w-2 rounded-full bg-success" />{sold} Sold</span>
        <span className="flex items-center gap-1.5 text-text-muted"><span className="h-2 w-2 rounded-full bg-slate-400" />{unsold} Unsold</span>
        <span className="flex items-center gap-1.5 text-text-secondary"><span className="h-2 w-2 rounded-full bg-primary" />{waiting} Waiting</span>
      </div>
    </div>
  );
}

// ─── Re-queue player modal ────────────────────────────────────────────────────

function RequeuePlayerModal({
  categoryBase,
  currentPrice,
  busy,
  onConfirm,
  onCancel,
}: {
  categoryBase: number;
  currentPrice: number;
  busy: boolean;
  onConfirm: (price: number) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState(currentPrice.toString());
  const parsed = Number(price);
  const valid = !isNaN(parsed) && parsed > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="reauction-title"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
      >
        <h2 id="reauction-title" className="text-lg font-bold text-text-primary">Re-auction Player</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Category Base
            </label>
            <p className="text-sm font-semibold text-text-primary">
              {formatMoney(categoryBase)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              New Base Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-text-muted text-sm font-medium">₹</span>
              <input
                type="number"
                min={1}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onCancel}
            className="min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={busy || !valid} onClick={() => onConfirm(parsed)}
            className="min-h-10 rounded-xl bg-warning px-4 text-sm font-semibold text-white hover:bg-warning/90 disabled:opacity-50">
            {busy ? 'Processing…' : 'Confirm & Re-queue'}
          </button>
        </div>
      </section>
    </div>
  );
}

// ─── Waiting queue panel ──────────────────────────────────────────────────────

function WaitingQueuePanel({
  snapshot,
  playerNameMap,
}: {
  snapshot: OrganizerAuctionSnapshot;
  playerNameMap: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const waiting = snapshot.queue.filter((q) => q.status === 'WAITING');
  if (waiting.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center justify-between gap-3"
      >
        <h3 className="font-semibold text-text-primary flex items-center gap-2">
          <List className="h-4 w-4" />
          Queue ({waiting.length} waiting)
        </h3>
        {expanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-1.5">
              {waiting.map((p, idx) => {
                const name = playerNameMap[p.player_id] ?? p.player_display_name ?? `Player ${p.player_id.substring(0, 8)}…`;
                return (
                  <div key={p.auction_player_id} className="flex items-center gap-3 rounded-lg bg-surface-muted px-3 py-2 text-sm">
                    <span className="shrink-0 h-5 w-5 flex items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate font-medium text-text-primary">{name}</span>
                    {p.category_code && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold bg-primary/10 text-primary">
                        Cat {p.category_code}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-text-muted">{formatMoney(p.base_price)}</span>
                    {p.attempt_number > 1 && (
                      <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                        #{p.attempt_number}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Confirm =
  | { type: 'SOLD' }
  | { type: 'UNSOLD' }
  | { type: 'COMPLETE' }
  | { type: 'REQUEUE'; playerId: string; playerVersion: number }
  | { type: 'REAUCTION_PRICE'; playerId: string; playerVersion: number; currentPrice: number };

interface Props {
  tournamentId: string;
  tournamentName: string;
  auctionId: string | null;
  initialSnapshot: OrganizerAuctionSnapshot | null;
  initialReadiness: ReadinessResult | null;
  categories: Array<{ id: string; code: 'A' | 'B' | 'C'; display_name: string; base_price: number; display_order: number }>;
  /** Server-fetched team name lookup keyed by team_id */
  teamNameMap: Record<string, { name: string; short_name: string | null }>;
  /** Server-fetched player display name lookup keyed by player_id */
  playerNameMap: Record<string, string>;
  /** 'SAME_BASE_PRICE' | 'ORGANIZER_SETS_PRICE' */
  reauctionPriceRule: string;
  minimumBidIncrement: number;
}

function genKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function OrganizerAuctionClient({
  tournamentId,
  tournamentName,
  auctionId: initialAuctionId,
  initialSnapshot,
  initialReadiness,
  categories,
  teamNameMap,
  playerNameMap,
  reauctionPriceRule,
  minimumBidIncrement,
}: Props) {
  const [snapshot, setSnapshot] = useState<OrganizerAuctionSnapshot | null>(initialSnapshot);
  const [readiness, setReadiness] = useState<ReadinessResult | null>(
    initialSnapshot?.readiness ?? initialReadiness
  );
  const [auctionId, setAuctionId] = useState<string | null>(initialAuctionId);
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [showRequeueModal, setShowRequeueModal] = useState<{
    playerId: string; playerVersion: number; categoryBase: number; currentPrice: number;
  } | null>(null);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  // Stable Supabase client — created once per component mount
  const supabase = useMemo(() => createClient(), []);

  const disposed = useRef(false);
  const lastSequence = useRef(initialSnapshot?.last_sequence ?? 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  // Derive current status for pre-auction DRAFT display
  const currentStatus: AuctionStatus = snapshot?.auction.status ?? 'DRAFT';
  const actions = availableActions(snapshot);

  // ── Snapshot refresh ──────────────────────────────────────────────────────

  const refreshSnapshot = useCallback(async (id: string) => {
    const { data, error: rpcErr } = await supabase.rpc('get_auction_organizer_state', {
      p_auction_id: id,
    });
    if (disposed.current) return;
    if (rpcErr) {
      setConnected(false);
      return;
    }
    const next = data as unknown as OrganizerAuctionSnapshot;
    lastSequence.current = Math.max(lastSequence.current, next.last_sequence ?? 0);
    setSnapshot(next);
    setReadiness(next.readiness);
    setConnected(true);
  }, [supabase]);

  const refreshReadiness = useCallback(async () => {
    const { data } = await supabase.rpc('get_auction_readiness', { p_tournament_id: tournamentId });
    if (disposed.current) return;
    if (data) setReadiness(data as unknown as ReadinessResult);
  }, [supabase, tournamentId]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!auctionId) return;
    disposed.current = false;

    const ch = supabase
      .channel(`org-auction-${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'auction_public_events',
          filter: `auction_id=eq.${auctionId}`,
        },
        (msg) => {
          const seq = Number((msg.new as { sequence_number?: number }).sequence_number ?? 0);
          if (lastSequence.current && seq > lastSequence.current + 1) {
            setError('Realtime reconnected after a missed event — state refreshed.');
          }
          lastSequence.current = Math.max(lastSequence.current, seq);
          void refreshSnapshot(auctionId);
        }
      )
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void refreshSnapshot(auctionId);
      });

    channelRef.current = ch;

    return () => {
      disposed.current = true;
      void supabase.removeChannel(ch);
    };
  }, [auctionId, refreshSnapshot, supabase]);

  useEffect(() => {
    if (!auctionId) return;
    const recoverWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshSnapshot(auctionId);
    };
    const recoverWhenOnline = () => void refreshSnapshot(auctionId);
    document.addEventListener('visibilitychange', recoverWhenVisible);
    window.addEventListener('online', recoverWhenOnline);
    return () => {
      document.removeEventListener('visibilitychange', recoverWhenVisible);
      window.removeEventListener('online', recoverWhenOnline);
    };
  }, [auctionId, refreshSnapshot]);

  // ── Generic operation runner ──────────────────────────────────────────────

  async function run<T>(fn: () => Promise<{ ok?: boolean; data?: T; error?: string }>) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      if (res.error) {
        setError(safeAuctionError(res.error));
        // Refresh to get latest state after any stale error
        if (auctionId) void refreshSnapshot(auctionId);
      } else {
        if (auctionId) void refreshSnapshot(auctionId);
      }
      return res;
    } finally {
      setBusy(false);
    }
  }

  // ── Prepare ───────────────────────────────────────────────────────────────

  async function handlePrepare() {
    setBusy(true);
    setError('');
    try {
      const res = await prepareAuctionAction(tournamentId);
      if (res.error) {
        setError(safeAuctionError(res.error));
        void refreshReadiness();
      } else {
        const newId = (res.data as { auction_id?: string })?.auction_id ?? null;
        if (newId) {
          setAuctionId(newId);
          void refreshSnapshot(newId);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  // ── Start / Pause / Resume ────────────────────────────────────────────────

  async function handleLifecycle(action: 'START' | 'PAUSE' | 'RESUME') {
    if (!auctionId || !snapshot) return;
    await run(() =>
      setAuctionLifecycleAction(auctionId, action, snapshot.auction.state_version, genKey())
    );
  }

  // ── Open next player ──────────────────────────────────────────────────────

  async function handleOpenNext() {
    if (!auctionId || !snapshot) return;
    await run(() =>
      openNextAuctionPlayerAction(auctionId, snapshot.auction.state_version, genKey())
    );
  }

  // ── SOLD (confirmed) ──────────────────────────────────────────────────────

  async function handleSold() {
    if (!auctionId || !snapshot?.current_player || !snapshot?.highest_bid) return;
    setConfirm(null);
    await run(() =>
      finalizeAuctionSaleAction(
        auctionId,
        snapshot.current_player!.auction_player_id,
        snapshot.current_player!.state_version,
        snapshot.highest_bid!.id,
        genKey()
      )
    );
  }

  // ── UNSOLD (confirmed) ────────────────────────────────────────────────────

  async function handleUnsold() {
    if (!auctionId || !snapshot?.current_player) return;
    setConfirm(null);
    await run(() =>
      markAuctionPlayerUnsoldAction(
        auctionId,
        snapshot.current_player!.auction_player_id,
        snapshot.current_player!.state_version,
        genKey()
      )
    );
  }

  // ── Requeue (confirmed) ───────────────────────────────────────────────────

  async function handleRequeue(playerId: string, playerVersion: number, newPrice?: number) {
    if (!auctionId) return;
    setConfirm(null);
    setShowRequeueModal(null);
    await run(() => requeueAuctionPlayerAction(auctionId, playerId, playerVersion, genKey(), newPrice));
  }

  // ── Complete (confirmed) ──────────────────────────────────────────────────

  async function handleComplete() {
    if (!auctionId || !snapshot) return;
    setConfirm(null);
    await run(() =>
      completeAuctionAction(auctionId, snapshot.auction.state_version, genKey())
    );
  }

  // ── Place Bid (Offline/Auctioneer) ──────────────────────────────────────────
  
  async function handlePlaceBid(teamId: string, amount: number) {
    if (!auctionId || !snapshot?.current_player) return;
    await run(async () => {
      const { error: bidErr } = await supabase.rpc('place_auction_bid', {
        p_auction_id: auctionId,
        p_auction_player_id: snapshot.current_player!.auction_player_id,
        p_team_id: teamId,
        p_amount: amount,
        p_request_key: genKey(),
        p_expected_player_version: snapshot.current_player!.state_version,
        p_expected_highest_bid: snapshot.highest_bid?.amount ?? 0,
      });
      if (bidErr) {
        throw new Error(safeAuctionError(bidErr.message));
      }
      return { ok: true };
    });
  }

  // ─── Unsold players (available for re-auction) ────────────────────────────

  const unsoldPlayers = snapshot?.queue.filter((q) => q.status === 'UNSOLD') ?? [];

  // ─── Storage base URL for player photos ──────────────────────────────────

  const storageBase = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`
    : '';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 relative pb-20">
      {/* Sticky Bottom Action Dock during active bidding */}
      {(currentStatus === 'LIVE' || currentStatus === 'PAUSED') && snapshot?.current_player && (
        <div className="fixed bottom-4 left-4 right-4 z-40 sm:left-auto sm:right-8 sm:max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-glass-border bg-surface-raised/95 backdrop-blur-2xl p-3.5 shadow-[0_16px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-bold uppercase tracking-wider text-text-muted">
                Stage: {snapshot.current_player.player.display_name}
              </p>
              <p className="text-sm font-black text-emerald-400 truncate">
                {snapshot.highest_bid ? `${snapshot.highest_bid.team.name} — ${formatMoney(snapshot.highest_bid.amount)}` : 'No Bids Yet'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions.canSold && (
                <button
                  type="button"
                  onClick={() => setConfirm({ type: 'SOLD' })}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all"
                >
                  <DollarSign className="h-4 w-4" />
                  SOLD
                </button>
              )}
              {actions.canUnsold && (
                <button
                  type="button"
                  onClick={() => setConfirm({ type: 'UNSOLD' })}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all"
                >
                  <XCircle className="h-4 w-4" />
                  UNSOLD
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header: tournament, status, connection */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="min-w-0">
          <p className="truncate text-sm text-text-secondary">{tournamentName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusChip status={currentStatus} />
            {auctionId && <ConnectionBadge connected={connected} />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(currentStatus === 'LIVE' || currentStatus === 'PAUSED' || currentStatus === 'READY') && (
            <button
              type="button"
              onClick={() => setShowAddPlayerModal(true)}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Player</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => (auctionId ? refreshSnapshot(auctionId) : refreshReadiness())}
            disabled={busy}
            title="Refresh state"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:bg-surface-muted disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="ml-auto shrink-0 opacity-60 hover:opacity-100">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Readiness (shown when not yet live / completed) */}
      {currentStatus !== 'COMPLETED' && (
        <ReadinessPanel readiness={readiness} />
      )}

      {/* Desktop: two-column layout / Mobile: single column */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left / main broadcast arena */}
        <div className="space-y-6 xl:col-span-2">
          {/* Current player + Bidding console side-by-side */}
          {snapshot && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-6 xl:col-span-6">
                <CurrentPlayerPanel snapshot={snapshot} storageBase={storageBase} tournamentName={tournamentName} />
              </div>
              <div className="md:col-span-6 xl:col-span-6">
                <AuctioneerBiddingPanel snapshot={snapshot} teamNameMap={teamNameMap} onPlaceBid={handlePlaceBid} busy={busy} minimumBidIncrement={minimumBidIncrement} />
              </div>
            </div>
          )}

          {/* Organizer controls */}
          <section className="rounded-3xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl p-6 shadow-xl">
            <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-text-muted">Auction Controls</h3>
            <div className="flex flex-wrap items-center gap-3">
              {/* Prepare */}
              {(currentStatus === 'DRAFT' || (currentStatus === 'READY' && !snapshot)) && (
                <button
                  type="button"
                  id="btn-prepare-auction"
                  onClick={handlePrepare}
                  disabled={busy || !(readiness?.ready)}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-hover px-6 py-3 text-sm font-bold text-white shadow-lg hover:shadow-primary/30 disabled:opacity-50 transition-all active:scale-95"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Prepare Auction
                </button>
              )}

              {/* Start */}
              {actions.canStart && (
                <button
                  type="button"
                  id="btn-start-auction"
                  onClick={() => handleLifecycle('START')}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:opacity-50 transition-all active:scale-95"
                >
                  <Play className="h-4 w-4" />
                  Start Auction
                </button>
              )}

              {/* Pause */}
              {actions.canPause && (
                <button
                  type="button"
                  id="btn-pause-auction"
                  onClick={() => handleLifecycle('PAUSE')}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/15 backdrop-blur-md px-5 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/25 disabled:opacity-50 transition-all active:scale-95"
                >
                  <Pause className="h-4 w-4" />
                  Pause Session
                </button>
              )}

              {/* Resume */}
              {actions.canResume && (
                <button
                  type="button"
                  id="btn-resume-auction"
                  onClick={() => handleLifecycle('RESUME')}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-primary-hover px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50 transition-all active:scale-95"
                >
                  <Play className="h-4 w-4" />
                  Resume Auction
                </button>
              )}

              {/* Open Next Player */}
              {actions.canOpenNext && (
                <button
                  type="button"
                  id="btn-open-next-player"
                  onClick={handleOpenNext}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl border border-primary/40 bg-primary/15 backdrop-blur-md px-6 py-3 text-sm font-bold text-primary hover:bg-primary/25 disabled:opacity-50 transition-all active:scale-95 shadow-md shadow-primary/10"
                >
                  <SkipForward className="h-4 w-4" />
                  Open Next Player
                </button>
              )}

              {/* SOLD - Hero Action Button */}
              {actions.canSold && (
                <button
                  type="button"
                  id="btn-sold"
                  onClick={() => setConfirm({ type: 'SOLD' })}
                  disabled={busy}
                  className="relative inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-8 py-3.5 text-base font-black text-white shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_40px_rgba(16,185,129,0.6)] hover:scale-[1.03] active:scale-95 disabled:opacity-50 transition-all duration-300 ring-2 ring-emerald-400/50"
                >
                  <DollarSign className="h-5 w-5" />
                  <span>SOLD {snapshot?.highest_bid ? `(${formatMoney(snapshot.highest_bid.amount)})` : ''}</span>
                </button>
              )}

              {/* UNSOLD */}
              {actions.canUnsold && (
                <button
                  type="button"
                  id="btn-unsold"
                  onClick={() => setConfirm({ type: 'UNSOLD' })}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 backdrop-blur-md px-5 py-3 text-sm font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 transition-all active:scale-95"
                >
                  <XCircle className="h-4 w-4" />
                  UNSOLD
                </button>
              )}

              {/* Complete Auction */}
              {actions.canComplete && (
                <button
                  type="button"
                  id="btn-complete-auction"
                  onClick={() => setConfirm({ type: 'COMPLETE' })}
                  disabled={busy}
                  className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-5 py-2.5 text-sm font-semibold text-text-secondary hover:border-primary/50 hover:text-primary disabled:opacity-50 transition-colors"
                >
                  <Trophy className="h-4 w-4" />
                  Complete Auction
                </button>
              )}
            </div>

            {busy && (
              <p className="mt-3 text-xs text-text-muted animate-pulse">Processing…</p>
            )}
          </section>

          {/* Unsold players — re-auction controls */}
          {unsoldPlayers.length > 0 && (currentStatus === 'LIVE' || currentStatus === 'PAUSED') && (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-3 font-semibold text-text-primary">
                Unsold Players ({unsoldPlayers.length})
              </h3>
              <div className="space-y-2">
                {unsoldPlayers.map((p) => {
                  const name = playerNameMap[p.player_id] ?? p.player_display_name ?? `Player ${p.player_id.substring(0, 8)}…`;
                  return (
                    <div key={p.auction_player_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">{name}</p>
                        <p className="text-xs text-text-muted">
                          {p.category_code ? `Cat ${p.category_code}` : ''}
                          {p.category_code ? ' · ' : ''}
                          Base {formatMoney(p.base_price)} · Attempt #{p.attempt_number}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (reauctionPriceRule === 'ORGANIZER_SETS_PRICE') {
                              setShowRequeueModal({
                                playerId: p.auction_player_id,
                                playerVersion: p.state_version,
                                categoryBase: p.category_base_price ?? p.base_price,
                                currentPrice: p.base_price,
                              });
                            } else {
                              setConfirm({
                                type: 'REQUEUE',
                                playerId: p.auction_player_id,
                                playerVersion: p.state_version,
                              });
                            }
                          }}
                          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-warning/50 hover:text-warning disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Re-queue
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Category legend */}
          {categories.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-3 text-sm font-semibold text-text-primary">Price Categories</h3>
              <div className="flex flex-wrap gap-3">
                {categories.map((cat) => (
                  <div key={cat.code} className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                      {cat.code}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{cat.display_name}</p>
                      <p className="text-xs text-text-muted">{formatMoney(cat.base_price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Waiting queue (collapsible) */}
          {snapshot && (
            <WaitingQueuePanel snapshot={snapshot} playerNameMap={playerNameMap} />
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Progress */}
          {snapshot && <AuctionProgress snapshot={snapshot} />}

          {/* Team wallets */}
          {snapshot && <TeamWalletMonitor snapshot={snapshot} teamNameMap={teamNameMap} />}

          {/* Recent bids */}
          {snapshot && snapshot.recent_bids.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <h3 className="mb-3 font-semibold text-text-primary">Recent Bids</h3>
              <div className="space-y-2">
                {snapshot.recent_bids.slice(0, 8).map((bid) => (
                  <div key={bid.id} className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
                    <span className="truncate text-text-secondary">{bid.team.short_name ?? bid.team.name}</span>
                    <span className="font-bold text-success">{formatMoney(bid.amount)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Confirmation modals ── */}
      <AnimatePresence>
        {confirm?.type === 'SOLD' && snapshot?.current_player && snapshot.highest_bid && (
          <ConfirmModal
            title="Confirm SOLD"
            description={`Mark ${snapshot.current_player.player.display_name} as SOLD to ${snapshot.highest_bid.team.name} for ${formatMoney(snapshot.highest_bid.amount)}? This cannot be undone without a correction.`}
            confirmLabel="SOLD"
            confirmClass="bg-success hover:bg-success/90"
            busy={busy}
            onConfirm={handleSold}
            onCancel={() => setConfirm(null)}
          />
        )}

        {confirm?.type === 'UNSOLD' && snapshot?.current_player && (
          <ConfirmModal
            title="Confirm UNSOLD"
            description={`Mark ${snapshot.current_player.player.display_name} as UNSOLD? No bids have been accepted. The player may be re-queued separately.`}
            confirmLabel="UNSOLD"
            confirmClass="bg-danger hover:bg-danger/90"
            busy={busy}
            onConfirm={handleUnsold}
            onCancel={() => setConfirm(null)}
          />
        )}

        {confirm?.type === 'REQUEUE' && (
          <ConfirmModal
            title="Re-queue Player"
            description="This unsold player will be moved to the end of the queue for a re-auction attempt."
            confirmLabel="Re-queue"
            confirmClass="bg-warning hover:bg-warning/90"
            busy={busy}
            onConfirm={() => handleRequeue(confirm.playerId, confirm.playerVersion)}
            onCancel={() => setConfirm(null)}
          />
        )}

        {confirm?.type === 'COMPLETE' && (
          <ConfirmModal
            title="Complete Auction"
            description="Mark the auction as completed. All remaining players must already be resolved. This action is final."
            confirmLabel="Complete Auction"
            confirmClass="bg-danger hover:bg-danger/90"
            busy={busy}
            onConfirm={handleComplete}
            onCancel={() => setConfirm(null)}
          />
        )}
      </AnimatePresence>

      {/* Re-auction queue modal */}
      {showRequeueModal && (
        <RequeuePlayerModal
          categoryBase={showRequeueModal.categoryBase}
          currentPrice={showRequeueModal.currentPrice}
          busy={busy}
          onConfirm={(price) =>
            handleRequeue(
              showRequeueModal.playerId,
              showRequeueModal.playerVersion,
              price
            )
          }
          onCancel={() => setShowRequeueModal(null)}
        />
      )}

      {/* Add Player Modal */}
      {showAddPlayerModal && auctionId && (
        <OrganizerAddPlayerModal
          tournamentId={tournamentId}
          auctionId={auctionId}
          categories={categories}
          onClose={() => setShowAddPlayerModal(false)}
          onSuccess={() => refreshSnapshot(auctionId)}
        />
      )}
    </div>
  );
}
