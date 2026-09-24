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

  // Classification state: allocation route for pending players
  const [classifications, setClassifications] = useState<Record<string, string>>({});
  // Price category state for pending players (in progress of being approved)
  const [pendingPriceCategories, setPendingPriceCategories] = useState<Record<string, string | null>>({});

  // Auction locked state (prepared = true if any player in queue)
  // We infer from prop — if auctionCategories are empty and isAuctionLeague, assume unlocked
  // Real lock comes from server — we just show conservative UI and let RPC error guide
  const auctionPrepared = false; // server determines; we disable controls on RPC error

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
        <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-fit">
          {(
            [
              ['PLAYERS', `Players (${players.length})`],
              ['TEAM_OWNERS', `Team Owners (${teamOwners.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === value
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="statusFilter" className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Filter:
          </label>
          <select
            id="statusFilter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="ALL">All Statuses ({getCount('ALL')})</option>
            <option value="PENDING">Pending ({getCount('PENDING')})</option>
            <option value="APPROVED">Approved ({getCount('APPROVED')})</option>
            <option value="REJECTED">Rejected ({getCount('REJECTED')})</option>
          </select>
        </div>
      </div>

      {/* Players tab */}
      <div className="mt-4">
        {tab === 'PLAYERS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
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

                return (
                  <div key={p.id} className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/60 bg-white dark:bg-slate-900/40 shadow-sm">
                    {/* Player photo */}
                    <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900">
                      {profile?.photo_path ? (
                        <Image
                          src={supabase.storage.from('avatars').getPublicUrl(profile.photo_path).data.publicUrl}
                          alt={profile.display_name}
                          fill
                          unoptimized
                          className="object-cover object-[center_22%]"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400 dark:text-slate-500">
                          <span className="text-4xl font-bold tracking-widest opacity-40">
                            {(profile?.display_name ?? '?').split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                      {/* Status badge */}
                      <span className={`absolute top-2 right-2 z-10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm ${p.status === 'APPROVED' ? 'bg-emerald-500/90 text-white' :
                          p.status === 'REJECTED' ? 'bg-red-500/90 text-white' :
                            p.status === 'PENDING' ? 'bg-amber-500/90 text-white' :
                              'bg-orange-500/90 text-white'
                        }`}>
                        {p.status === 'CHANGES_REQUESTED' ? 'CHANGES' : p.status}
                      </span>
                    </div>

                    {/* Player info */}
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="line-clamp-2 font-bold text-slate-900 dark:text-slate-100">
                        {profile?.display_name}
                      </h3>
                      {/* Volleyball position — always shown separately from auction info */}
                      <p className="mt-0.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                        {formatVolleyballPosition(profile?.primary_position)}
                      </p>
                      {profile?.secondary_position && (
                        <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                          Secondary: {formatVolleyballPosition(profile.secondary_position)}
                        </p>
                      )}

                      {/* ── PENDING / CHANGES_REQUESTED: classification controls ── */}
                      {isPending && isAuctionLeague && (
                        <div className="mt-3 space-y-2">
                          {/* Allocation route */}
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Allocation Route
                            </label>
                            <select
                              value={classifications[p.id] || p.auction_category || ''}
                              onChange={(e) =>
                                setClassifications((prev) => ({ ...prev, [p.id]: e.target.value }))
                              }
                              disabled={isSubmitting}
                              className="h-9 w-full rounded-md border border-border bg-surface-muted px-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                            >
                              <option value="" disabled>
                                Select route…
                              </option>
                              <option value="MAIN_AUCTION">Main Auction</option>
                              <option value="ICON_LOT">Icon Player</option>
                              <option value="SETTER_LOT">Setter</option>
                            </select>
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
                                <select
                                  value={pendingPriceCategories[p.id] ?? p.auction_price_category_id ?? ''}
                                  onChange={(e) =>
                                    setPendingPriceCategories((prev) => ({
                                      ...prev,
                                      [p.id]: e.target.value || null,
                                    }))
                                  }
                                  disabled={isSubmitting}
                                  className="h-9 w-full rounded-md border border-border bg-surface-muted px-2.5 text-sm text-text-primary focus:border-primary focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
                                >
                                  <option value="">Needs Category…</option>
                                  {auctionCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.code} — {cat.display_name} — ₹
                                      {cat.base_price.toLocaleString('en-IN')}
                                    </option>
                                  ))}
                                </select>
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
                    <div className="border-t border-slate-100 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/80 p-4">
                      {isPending && (
                        <div className="flex flex-col-reverse min-[350px]:flex-row gap-2">
                          <button
                            type="button"
                            onClick={() => handleRejectPlayer(p.id)}
                            disabled={isSubmitting}
                            className="h-10 flex-1 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                          >
                            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                            Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApprovePlayer(p.id)}
                            disabled={isSubmitting}
                            className="h-10 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
                  </div>
                );
              })
            )}
          </div>
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
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col"
                >
                  <div className="h-32 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
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
                          className="h-10 flex-1 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 text-sm font-medium text-red-600 dark:text-red-400 shadow-sm hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {loadingId === o.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApproveOwner(o.id)}
                          disabled={loadingId === o.id}
                          className="h-10 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
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
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
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
                className="mt-2 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={loadingId === correction.id}
                onClick={() => setCorrection(null)}
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loadingId === correction.id}
                onClick={handleCorrection}
                className={`min-h-11 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${correction.action === 'revoke'
                    ? 'bg-danger hover:bg-danger/90'
                    : 'bg-primary hover:bg-primary-hover'
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
    </div>
  );
}
