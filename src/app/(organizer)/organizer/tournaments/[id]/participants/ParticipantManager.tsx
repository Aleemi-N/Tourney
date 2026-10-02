'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from 'react';
import {
  approvePlayerAction,
  rejectPlayerAction,
  approveTeamOwnerAction,
  rejectTeamOwnerAction,
  reopenPlayerRegistrationAction,
  revokePlayerApprovalAction,
} from '@/app/actions/participants';
import { classifyAuctionPlayerAction } from '@/app/actions/auction';
import Image from 'next/image';
import { Loader2, Tag, RefreshCcw } from 'lucide-react';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import { AnimatedSelect } from './AnimatedSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerDetailModal, PlayerDetailData } from '@/components/player/PlayerDetailModal';
import { downloadAllPlayerCardsZip } from '@/lib/generate-player-card';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 }
  }
};


// ─── Types ────────────────────────────────────────────────────────────────────

type AuctionCategoryOption = {
  id: string;
  code: string;         // 'A' | 'B' | 'C'
  display_name: string;
  base_price: number;
  display_order: number;
};

type TournamentSettings = {
  icon_selection_method: string;
  setter_selection_method: string;
};

// Determine whether a player's auction_category requires an A/B/C price category
function requiresPriceCategory(
  auctionCategory: string | null | undefined,
  settings: TournamentSettings | null
): boolean {
  if (!auctionCategory || !settings) return false;
  if (auctionCategory === 'MAIN_AUCTION') return true;
  if (auctionCategory === 'ICON_LOT' && settings.icon_selection_method === 'AUCTION') return true;
  if (auctionCategory === 'SETTER_LOT' && settings.setter_selection_method === 'AUCTION') return true;
  return false;
}

function allocationRouteLabel(auctionCategory: string | null | undefined): string {
  if (!auctionCategory) return 'Not Classified';
  const labels: Record<string, string> = {
    MAIN_AUCTION: 'Main Auction',
    ICON_LOT: 'Icon Player',
    SETTER_LOT: 'Setter',
  };
  return labels[auctionCategory] ?? auctionCategory;
}

// ─── PriceCategoryBadge ───────────────────────────────────────────────────────

// ─── Approved player classification panel ─────────────────────────────────────


function ApprovedPlayerPanel({
  player,
  auctionCategories,
  settings,
  auctionLocked,
  isSubmitting,
  onReclassify,
  onRevoke,
}: {
  player: any;
  auctionCategories: AuctionCategoryOption[];
  settings: TournamentSettings | null;
  auctionLocked: boolean;
  isSubmitting: boolean;
  onReclassify: (categoryId: string | null) => Promise<void>;
  onRevoke: () => void;
}) {
  const assigned = auctionCategories.find((c) => c.id === player.auction_price_category_id);
  const needsCategory = requiresPriceCategory(player.auction_category, settings);

  return (
    <div className="space-y-2">
      {/* Allocation route badge */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          ✓ Approved
        </span>
        {player.auction_category && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-400">
            {allocationRouteLabel(player.auction_category)}
          </span>
        )}
      </div>

      {/* Price category display or select */}
      {needsCategory ? (
        auctionLocked ? (
          <div className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold ${assigned ? 'bg-primary/10 text-primary' : 'bg-danger/10 text-danger'
            }`}>
            <LockClosedIcon className="h-3.5 w-3.5 shrink-0" />
            {assigned
              ? `${assigned.code} — ${assigned.display_name} — ₹${assigned.base_price.toLocaleString('en-IN')}`
              : 'Needs Category (Locked)'}
          </div>
        ) : (
          <div className="space-y-1">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Auction Price Category
            </label>
            <select
              value={player.auction_price_category_id ?? ''}
              onChange={(e) => onReclassify(e.target.value || null)}
              disabled={isSubmitting}
              className="h-9 w-full rounded-md border border-border bg-surface-muted px-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
            >
              <option value="">Needs Category…</option>
              {auctionCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.code} — {cat.display_name} — ₹{cat.base_price.toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>
        )
      ) : player.auction_category ? (
        <div className="flex items-center gap-1.5 rounded-md bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-500">
          <Tag className="h-3.5 w-3.5 shrink-0" />
          Lot Draw — No Auction Category Required
        </div>
      ) : null}

      {/* Revoke / correction control */}
      {!auctionLocked && (
        <button
          type="button"
          onClick={onRevoke}
          disabled={isSubmitting}
          className="self-start rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-warning/50 hover:text-warning disabled:opacity-50"
        >
          Revoke Approval
        </button>
      )}
    </div>
  );
}

// ─── Main ParticipantManager ──────────────────────────────────────────────────

export function ParticipantManager({
  tournament,
  players,
  teamOwners,
  auctionCategories = [],
  tournamentSettings = null,
}: {
  tournament: any;
  players: any[];
  teamOwners: any[];
  auctionCategories?: AuctionCategoryOption[];
  tournamentSettings?: TournamentSettings | null;
}) {
  const [tab, setTab] = useState<'PLAYERS' | 'TEAM_OWNERS'>('PLAYERS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const isAuctionLeague = tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  // Supabase client for storage URL generation
  const supabase = createClient();

  // Local loading states
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [correction, setCorrection] = useState<{
    id: string;
    name: string;
    action: 'revoke' | 'reopen';
    reason: string;
  } | null>(null);
  const [selectedModalPlayer, setSelectedModalPlayer] = useState<PlayerDetailData | null>(null);

  // Classification state: allocation route for pending players
  const [classifications, setClassifications] = useState<Record<string, string>>({});
  // Price category state for pending players (in progress of being approved)
  const [pendingPriceCategories, setPendingPriceCategories] = useState<Record<string, string | null>>({});

  // Auction locked state
  const auctionPrepared = false;

  // Bulk zip download state
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number } | null>(null);

  const handleDownloadAllZip = async () => {
    if (players.length === 0) return;
    setIsDownloadingZip(true);
    setZipProgress({ current: 0, total: players.length });
    try {
      await downloadAllPlayerCardsZip(
        players,
        auctionCategories,
        supabase,
        (current, total) => {
          setZipProgress({ current, total });
        }
      );
    } catch (err) {
      console.error('Failed to generate bulk cards ZIP:', err);
      setMessage({ type: 'error', text: 'Failed to generate cards ZIP bundle.' });
    } finally {
      setIsDownloadingZip(false);
      setZipProgress(null);
    }
  };

  const router = useRouter();

  const filteredPlayers = players.filter(
    (p) => statusFilter === 'ALL' || p.status === statusFilter
  );
  const filteredOwners = teamOwners.filter(
    (o) => statusFilter === 'ALL' || o.status === statusFilter
  );

  const getPlayerCount = (status: string) =>
    status === 'ALL' ? players.length : players.filter((p) => p.status === status).length;
  const getOwnerCount = (status: string) =>
    status === 'ALL' ? teamOwners.length : teamOwners.filter((o) => o.status === status).length;
  const getCount = (status: string) =>
    tab === 'PLAYERS' ? getPlayerCount(status) : getOwnerCount(status);

  const handleApprovePlayer = async (regId: string) => {
    setMessage(null);
    setLoadingId(regId);
    try {
      const cls = classifications[regId];
      if (isAuctionLeague && !cls) {
        setMessage({ type: 'error', text: 'Please select an allocation classification.' });
        return;
      }

      // Determine if price category is required for this allocation
      const needsCat = requiresPriceCategory(cls, tournamentSettings);
      const priceCategoryId = pendingPriceCategories[regId] ?? null;

      if (isAuctionLeague && needsCat && !priceCategoryId) {
        setMessage({
          type: 'error',
          text: `A price category (A/B/C) is required for ${allocationRouteLabel(cls)} players.`,
        });
        return;
      }

      // Use classifyAuctionPlayerAction which wraps approve_player_registration with category support
      if (isAuctionLeague) {
        const res = await classifyAuctionPlayerAction(regId, cls, priceCategoryId ?? null);
        if (res.error) {
          setMessage({ type: 'error', text: res.error });
          router.refresh();
        } else {
          setMessage({ type: 'success', text: 'Player application approved.' });
          router.refresh();
        }
      } else {
        const res = await approvePlayerAction(regId, null);
        if (res.error) {
          setMessage({ type: 'error', text: res.error });
          router.refresh();
        } else {
          setMessage({ type: 'success', text: 'Player application approved.' });
          router.refresh();
        }
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleReclassifyApproved = async (
    regId: string,
    auctionCategory: string,
    priceCategoryId: string | null
  ) => {
    setMessage(null);
    setLoadingId(regId);
    try {
      const res = await classifyAuctionPlayerAction(regId, auctionCategory, priceCategoryId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
      } else {
        setMessage({ type: 'success', text: 'Price category updated.' });
      }
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  const handleRejectPlayer = async (regId: string) => {
    setMessage(null);
    setLoadingId(regId);
    try {
      const res = await rejectPlayerAction(regId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Player application rejected.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleApproveOwner = async (appId: string) => {
    setMessage(null);
    setLoadingId(appId);
    try {
      const res = await approveTeamOwnerAction(appId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Team owner application approved.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleRejectOwner = async (appId: string) => {
    setMessage(null);
    setLoadingId(appId);
    try {
      const res = await rejectTeamOwnerAction(appId);
      if (res.error) {
        setMessage({ type: 'error', text: res.error });
        router.refresh();
      } else {
        setMessage({ type: 'success', text: 'Team owner application rejected.' });
        router.refresh();
      }
    } finally {
      setLoadingId(null);
    }
  };

  const handleCorrection = async () => {
    if (!correction) return;
    setMessage(null);
    setLoadingId(correction.id);
    try {
      const result =
        correction.action === 'revoke'
          ? await revokePlayerApprovalAction(correction.id, correction.reason)
          : await reopenPlayerRegistrationAction(correction.id, correction.reason);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text:
            correction.action === 'revoke'
              ? 'Player approval revoked. The registration is pending review.'
              : 'Player application reopened. The registration is pending review.',
        });
      }
      setCorrection(null);
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {message && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm ${message.type === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
            }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex bg-surface-raised/50 backdrop-blur-xl border border-glass-border p-1.5 rounded-xl w-fit shadow-sm">
          {(
            [
              ['PLAYERS', `Players (${players.length})`],
              ['TEAM_OWNERS', `Team Owners (${teamOwners.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-5 py-2 text-sm font-bold rounded-lg transition-all duration-300 ${tab === value
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {tab === 'PLAYERS' && (
            <button
              type="button"
              onClick={handleDownloadAllZip}
              disabled={isDownloadingZip || players.length === 0}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md transition-all active:scale-95 disabled:opacity-50 border border-amber-300/40"
              title="Download a ZIP archive containing high-res auction cards for all registered players"
            >
              {isDownloadingZip ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
                  <span>
                    Generating ZIP ({zipProgress?.current ?? 0}/{zipProgress?.total ?? players.length})…
                  </span>
                </>
              ) : (
                <>
                  <span>📦</span>
                  <span>Download All Cards (ZIP)</span>
                </>
              )}
            </button>
          )}

          <label htmlFor="statusFilter" className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Filter:
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="p-2.5 rounded-xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl text-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary shadow-sm transition-all bg-[#181825]"
          >
            <option value="ALL" className="bg-[#181825] text-white">All Statuses ({getCount('ALL')})</option>
            <option value="PENDING" className="bg-[#181825] text-white">Pending ({getCount('PENDING')})</option>
            <option value="APPROVED" className="bg-[#181825] text-white">Approved ({getCount('APPROVED')})</option>
            <option value="REJECTED" className="bg-[#181825] text-white">Rejected ({getCount('REJECTED')})</option>
          </select>
        </div>
      </div>

      {/* Players tab */}
      <div className="mt-4">
        {tab === 'PLAYERS' && (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
          >
            {filteredPlayers.length === 0 ? (
              <p className="text-slate-500 text-sm col-span-full">
                {statusFilter === 'ALL'
                  ? 'No players found.'
                  : `No ${statusFilter.toLowerCase()} players.`}
              </p>
            ) : (
              filteredPlayers.map((p) => {
                const profile = p.player_profiles;
                const isSubmitting = loadingId === p.id;
                const isPending =
                  p.status === 'PENDING' || p.status === 'CHANGES_REQUESTED';
                const isApproved = p.status === 'APPROVED';
                const assignedCat = auctionCategories.find((c) => c.id === (pendingPriceCategories[p.id] ?? p.auction_price_category_id));

                const openPlayerModal = () => {
                  if (profile) {
                    setSelectedModalPlayer({
                      id: profile.id,
                      display_name: profile.display_name,
                      photo_path: profile.photo_path,
                      primary_position: profile.primary_position,
                      secondary_position: profile.secondary_position,
                      place: profile.place,
                      height_cm: profile.height_cm,
                      phone: profile.phone,
                      date_of_birth: profile.date_of_birth,
                      playing_history: profile.playing_history,
                      jersey_name: profile.jersey_name,
                      jersey_number: profile.jersey_number,
                      jersey_size: profile.jersey_size,
                      category_code: assignedCat?.code ?? null,
                      base_price: assignedCat?.base_price ?? null,
                    });
                  }
                };

                return (
                  <motion.div variants={itemVariants} key={p.id} className="group relative flex h-full flex-col overflow-visible rounded-2xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl shadow-[0_4px_20px_rgb(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.15)] hover:border-primary/40 hover:-translate-y-1 hover:z-50 focus-within:z-50">
                    {/* Player photo */}
                    <div
                      onClick={openPlayerModal}
                      className="relative aspect-[4/5] w-full shrink-0 overflow-hidden bg-surface rounded-t-2xl cursor-pointer"
                      title="Click to view full player profile card"
                    >
                      {profile?.photo_path ? (
                        <Image
                          src={supabase.storage.from('avatars').getPublicUrl(profile.photo_path).data.publicUrl}
                          alt={profile.display_name}
                          fill
                          unoptimized
                          className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-900/60">
                          <span className="text-4xl font-bold tracking-widest opacity-40">
                            {(profile?.display_name ?? '?').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      
                      {/* Printable Card Badge Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPlayerModal();
                        }}
                        className="absolute top-3 left-3 z-10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg bg-amber-500/90 text-slate-950 hover:bg-amber-400 backdrop-blur-md shadow-md transition-all border border-amber-300/40 flex items-center gap-1 active:scale-95"
                        title="Download printable pre-auction card PNG"
                      >
                        <span>🎴</span> Print Card
                      </button>

                      {/* Status badge */}
                      <span className={`absolute top-3 right-3 z-10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg backdrop-blur-md shadow-sm border ${
                          p.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                          p.status === 'REJECTED' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                          p.status === 'PENDING' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                          'bg-orange-500/20 text-orange-300 border-orange-500/30'
                        }`}>
                        {p.status === 'CHANGES_REQUESTED' ? 'CHANGES' : p.status}
                      </span>
                    </div>

                    {/* Player info */}
                    <div className="flex flex-1 flex-col px-4 pt-3.5 pb-4 relative z-10 bg-surface-raised/90 border-t border-glass-border/40">
                      <h3
                        onClick={openPlayerModal}
                        className="line-clamp-2 text-base font-black tracking-tight text-slate-900 dark:text-slate-100 cursor-pointer hover:text-primary transition-colors"
                      >
                        {profile?.display_name}
                      </h3>
                      {/* Volleyball position — always shown separately from auction info */}
                      <p className="mt-0.5 text-xs font-bold text-primary uppercase tracking-wider">
                        {formatVolleyballPosition(profile?.primary_position)}
                      </p>
                      {profile?.secondary_position && (
                        <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Secondary: {formatVolleyballPosition(profile.secondary_position)}
                        </p>
                      )}

                      {/* ── PENDING / CHANGES_REQUESTED: classification controls ── */}
                      {isPending && isAuctionLeague && (
                        <div className="mt-3 space-y-2">
                          {/* Allocation route */}
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Allocation Route ({auctionCategories.length})
                            </label>
                            <AnimatedSelect
                              value={classifications[p.id] || p.auction_category || ''}
                              onChange={(val) => setClassifications((prev) => ({ ...prev, [p.id]: val }))}
                              disabled={isSubmitting}
                              placeholder="Select route…"
                              options={[
                                { value: 'MAIN_AUCTION', label: 'Main Auction' },
                                { value: 'ICON_LOT', label: 'Icon Player' },
                                { value: 'SETTER_LOT', label: 'Setter' },
                              ]}
                            />
                          </div>

                          {/* Price category — only shown when route requires it */}
                          {isAuctionLeague &&
                            requiresPriceCategory(
                              classifications[p.id] || p.auction_category,
                              tournamentSettings
                            ) && (
                              <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                  Auction Price Category
                                </label>
                                <AnimatedSelect
                                  value={pendingPriceCategories[p.id] ?? p.auction_price_category_id ?? ''}
                                  onChange={(val) =>
                                    setPendingPriceCategories((prev) => ({
                                      ...prev,
                                      [p.id]: val || null,
                                    }))
                                  }
                                  disabled={isSubmitting}
                                  placement="top"
                                  placeholder="Needs Category…"
                                  options={auctionCategories.map((cat) => ({
                                    value: cat.id,
                                    label: `${cat.code} — ${cat.display_name}`,
                                    subtitle: `₹${cat.base_price.toLocaleString('en-IN')}`,
                                  }))}
                                />
                              </div>
                            )}
                        </div>
                      )}

                      {/* ── APPROVED: show classification + price category (editable if unlocked) ── */}
                      {isApproved && isAuctionLeague && (
                        <div className="mt-3">
                          <ApprovedPlayerPanel
                            player={p}
                            auctionCategories={auctionCategories}
                            settings={tournamentSettings}
                            auctionLocked={auctionPrepared}
                            isSubmitting={isSubmitting}
                            onReclassify={async (categoryId) => {
                              await handleReclassifyApproved(
                                p.id,
                                p.auction_category,
                                categoryId
                              );
                            }}
                            onRevoke={() =>
                              setCorrection({
                                id: p.id,
                                name: profile.display_name,
                                action: 'revoke',
                                reason: '',
                              })
                            }
                          />
                        </div>
                      )}
                    </div>

                    {/* Actions footer */}
                    <div className="border-t border-glass-border bg-surface-muted/20 p-4 backdrop-blur-md">
                      {isPending && (
                        <div className="flex flex-col min-[450px]:flex-row gap-3">
                          <button
                            type="button"
                            onClick={() => handleRejectPlayer(p.id)}
                            disabled={isSubmitting}
                            className="h-11 flex-1 rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-bold text-danger hover:bg-danger/20 hover:border-danger/50 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                          >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovePlayer(p.id)}
                            disabled={isSubmitting}
                            className="h-11 flex-1 rounded-xl bg-gradient-to-r from-success/90 to-emerald-500/90 hover:from-success hover:to-emerald-500 px-4 text-sm font-bold text-white shadow-[0_4px_15px_rgb(16,185,129,0.25)] hover:shadow-[0_8px_25px_rgb(16,185,129,0.35)] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 hover:-translate-y-0.5 border border-success/20"
                          >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Approve
                          </button>
                        </div>
                      )}
                      {isApproved && !isAuctionLeague && (
                        <div className="flex items-center gap-2">
                          <span className="block flex-1 text-center px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase">
                            Approved
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCorrection({
                                id: p.id,
                                name: profile.display_name,
                                action: 'revoke',
                                reason: '',
                              })
                            }
                            disabled={isSubmitting}
                            className="rounded-md border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:border-warning/50 hover:text-warning disabled:opacity-50 transition-colors"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                      {p.status === 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() =>
                            setCorrection({
                              id: p.id,
                              name: profile.display_name,
                              action: 'reopen',
                              reason: '',
                            })
                          }
                          disabled={isSubmitting}
                          className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-xs font-medium text-text-secondary hover:border-primary/50 hover:text-primary disabled:opacity-50 transition-colors"
                        >
                          <RefreshCcw className="h-3.5 w-3.5" />
                          Reopen Application
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}

        {tab === 'TEAM_OWNERS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOwners.length === 0 ? (
              <p className="text-slate-500 text-sm col-span-full">
                {statusFilter === 'ALL'
                  ? 'No team owner applications found.'
                  : `No ${statusFilter.toLowerCase()} team owner applications.`}
              </p>
            ) : (
              filteredOwners.map((o) => (
                <div
                  key={o.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl shadow-[0_4px_20px_rgb(0,0,0,0.1)] transition-all duration-300 hover:shadow-lg hover:border-primary/30 hover:-translate-y-1"
                >
                  <div className="h-32 bg-surface relative flex items-center justify-center border-b border-glass-border/50">
                    {o.logo_path ? (
                      <Image
                        src={
                          supabase.storage
                            .from('logos')
                            .getPublicUrl(o.logo_path).data.publicUrl
                        }
                        alt="Team Logo"
                        fill
                        className="object-contain p-2"
                        unoptimized
                      />
                    ) : (
                      <div className="text-slate-400 dark:text-slate-600 font-bold text-2xl">
                        {o.team_short_name || 'TEAM'}
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 truncate">
                        {o.proposed_team_name}
                      </h3>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 flex flex-col gap-0.5">
                        {o.profiles?.full_name && (
                          <span>Applicant: {o.profiles.full_name}</span>
                        )}
                        {o.place && <span>Place: {o.place}</span>}
                      </div>
                    </div>

                    {['PENDING', 'CHANGES_REQUESTED'].includes(o.status) && (
                      <div className="mt-auto pt-4 flex flex-col-reverse min-[350px]:flex-row gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => handleRejectOwner(o.id)}
                          disabled={loadingId === o.id}
                          className="h-11 flex-1 rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-bold text-danger hover:bg-danger/20 hover:border-danger/50 disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                        >
                          {loadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveOwner(o.id)}
                          disabled={loadingId === o.id}
                          className="h-11 flex-1 rounded-xl bg-gradient-to-r from-success/90 to-emerald-500/90 hover:from-success hover:to-emerald-500 px-4 text-sm font-bold text-white shadow-[0_4px_15px_rgb(16,185,129,0.25)] hover:shadow-[0_8px_25px_rgb(16,185,129,0.35)] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2 active:scale-95 hover:-translate-y-0.5 border border-success/20"
                        >
                          {loadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Approve
                        </button>
                      </div>
                    )}

                    {o.status === 'APPROVED' && (
                      <div className="mt-auto pt-2">
                        <span className="block w-full text-center px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase">
                          Approved
                        </span>
                      </div>
                    )}
                    {o.status === 'REJECTED' && (
                      <div className="mt-auto pt-2">
                        <span className="block w-full text-center px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold uppercase">
                          Rejected
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Correction modal */}
      {correction && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="presentation"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="correction-title"
            aria-describedby="correction-description"
            className="w-full max-w-md rounded-3xl border border-glass-border bg-surface-raised/90 backdrop-blur-3xl p-6 sm:p-8 shadow-[0_16px_60px_rgb(0,0,0,0.5)] transform transition-all"
          >
            <h2 id="correction-title" className="text-xl font-bold text-text-primary">
              {correction.action === 'revoke' ? 'Revoke approval?' : 'Reopen application?'}
            </h2>
            <p
              id="correction-description"
              className="mt-2 text-sm leading-6 text-text-secondary"
            >
              {correction.action === 'revoke'
                ? `${correction.name}'s registration will return to Pending for review. Their profile and registration information will be preserved.`
                : `${correction.name}'s registration will return to Pending for review.`}
            </p>
            <label className="mt-5 block text-sm font-medium text-text-primary">
              Reason <span className="font-normal text-text-muted">(optional)</span>
              <textarea
                value={correction.reason}
                maxLength={1000}
                rows={3}
                onChange={(event) =>
                  setCorrection({ ...correction, reason: event.target.value })
                }
                placeholder="Add an internal audit note"
                className="mt-2 w-full resize-y rounded-xl border border-glass-border bg-surface/50 backdrop-blur-sm px-4 py-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
              />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={loadingId === correction.id}
                onClick={() => setCorrection(null)}
                className="min-h-[44px] rounded-xl border border-glass-border bg-surface-muted/30 px-6 text-sm font-bold text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingId === correction.id}
                onClick={handleCorrection}
                className={`min-h-[44px] rounded-xl px-6 text-sm font-bold text-white shadow-lg disabled:opacity-50 transition-all hover:-translate-y-0.5 active:scale-95 ${correction.action === 'revoke'
                    ? 'bg-gradient-to-r from-danger to-red-600 shadow-danger/25 hover:shadow-danger/40'
                    : 'bg-gradient-to-r from-primary to-primary-hover shadow-primary/25 hover:shadow-primary/40'
                  }`}
              >
                {loadingId === correction.id
                  ? 'Updating…'
                  : correction.action === 'revoke'
                    ? 'Revoke Approval'
                    : 'Reopen Application'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Player Detail Card Modal */}
      <PlayerDetailModal
        isOpen={Boolean(selectedModalPlayer)}
        onClose={() => setSelectedModalPlayer(null)}
        player={selectedModalPlayer}
      />
    </div>
  );
}
