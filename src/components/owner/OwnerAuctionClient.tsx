'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import type { OwnerSnapshot } from '@/lib/owner/owner-auction';
import { UserIcon, ShieldCheckIcon, RadioIcon, SparklesIcon, AlertTriangleIcon, CheckCircleIcon, TrendingUpIcon } from 'lucide-react';
import { AuctionPlayerCard } from '@/components/auction/AuctionPlayerCard';

const money = (value: number | null | undefined) =>
    `₹${Math.max(0, Number(value ?? 0)).toLocaleString('en-IN')}`;

const formatPos = (pos?: string | null) =>
    pos ? pos.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Position Pending';

export function OwnerAuctionClient({
    auctionId,
    teamId,
    initialSnapshot,
}: {
    auctionId: string | null;
    teamId: string;
    initialSnapshot: OwnerSnapshot | null;
}) {
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [connectionState, setConnectionState] = useState('Live snapshot');
    const lastSequence = useRef(initialSnapshot?.last_sequence ?? 0);

    const refreshSnapshot = useCallback(async () => {
        if (!auctionId) return false;
        const supabase = createClient();
        const { data, error } = await supabase.rpc('get_auction_owner_state', {
            p_auction_id: auctionId,
            p_team_id: teamId,
        });
        if (error) {
            setConnectionState('Snapshot unavailable');
            return false;
        }
        const next = data as OwnerSnapshot;
        lastSequence.current = Math.max(lastSequence.current, next.last_sequence ?? 0);
        setSnapshot(next);
        setConnectionState('Live connected');
        return true;
    }, [auctionId, teamId]);

    useEffect(() => {
        if (!auctionId) return;
        const supabase = createClient();
        let disposed = false;

        const recoverSnapshot = async () => {
            if (!disposed) await refreshSnapshot();
        };

        const channel = supabase
            .channel(`owner-auction-${auctionId}-${teamId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'auction_public_events',
                    filter: `auction_id=eq.${auctionId}`,
                },
                (message) => {
                    const sequence = Number((message.new as { sequence_number?: number }).sequence_number ?? 0);
                    if (lastSequence.current && sequence > lastSequence.current + 1) {
                        setConnectionState('Reconnecting…');
                    }
                    lastSequence.current = Math.max(lastSequence.current, sequence);
                    void recoverSnapshot();
                },
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') setConnectionState('Live connected');
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    setConnectionState('Reconnecting…');
                    void recoverSnapshot();
                }
            });

        const recoverWhenVisible = () => {
            if (document.visibilityState === 'visible') void recoverSnapshot();
        };
        const recoverWhenOnline = () => void recoverSnapshot();
        document.addEventListener('visibilitychange', recoverWhenVisible);
        window.addEventListener('online', recoverWhenOnline);

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', recoverWhenVisible);
            window.removeEventListener('online', recoverWhenOnline);
            void supabase.removeChannel(channel);
        };
    }, [auctionId, refreshSnapshot, teamId]);

    const player = snapshot?.current_player;
    const team = snapshot?.team;
    const renderSnapshot = snapshot ?? { next_minimum_bid: 0, highest_bid: null };
    const leading = Boolean(snapshot?.highest_bid?.team.id === teamId);
    const photoUrl = player?.player.photo_path
        ? resolvePublicStorageUrl(createClient(), 'avatars', player.player.photo_path)
        : null;

    const blockedMessage = team?.blocked_reason === 'PROTECTED_PURSE'
        ? 'Your usable purse must protect the remaining minimum-squad reserve.'
        : team?.blocked_reason === 'AUCTION_NOT_LIVE'
            ? 'Bidding opens when the organizer starts the auction.'
            : team?.blocked_reason === 'NO_LIVE_PLAYER'
                ? 'Waiting for the auctioneer to bring the next player.'
                : team && !team.may_bid
                    ? 'Your team cannot bid in the current authoritative state.'
                    : null;

    const bidStanding = blockedMessage
        ? 'Cannot bid'
        : leading
            ? 'Leading'
            : renderSnapshot.highest_bid
                ? 'Outbid'
                : 'Ready to bid';

    if (!auctionId) {
        return (
            <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
                Auction preparation is not available for this team yet.
            </section>
        );
    }

    return (
        <div className="space-y-6">
            {/* Live Header Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Live Auction Arena</p>
                        <p className="text-xs text-neutral-400">{connectionState}</p>
                    </div>
                </div>

                {snapshot?.auction ? (
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-fuchsia-300">
                            <RadioIcon className="h-3.5 w-3.5 animate-pulse" />
                            {snapshot.auction.status}
                        </span>
                    </div>
                ) : null}
            </div>

            {/* Main Stadium Layout */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
                
                {/* LEFT SPOTLIGHT: Current Player Card */}
                <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#16122b] to-[#0c0919] p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
                    <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-[80px] pointer-events-none" />
                    
                    <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
                        <div className="flex items-center gap-2">
                            <SparklesIcon className="h-4 w-4 text-fuchsia-400" />
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300/80">Stage Spotlight</p>
                        </div>
                        {player?.category_code ? (
                            <span className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/20 px-3 py-1 text-xs font-black uppercase text-fuchsia-200">
                                Cat {player.category_code}{player.category_label ? ` — ${player.category_label}` : ''}
                            </span>
                        ) : null}
                    </div>

                    {player ? (
                        <AuctionPlayerCard
                            player={player}
                            highestBid={renderSnapshot.highest_bid}
                            supabase={createClient()}
                            currentlyBiddingTeamName={leading ? 'Your Team (YOU ARE LEADING)' : (renderSnapshot.highest_bid?.team.short_name ?? renderSnapshot.highest_bid?.team.name)}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center p-16 text-center">
                            <div className="rounded-full bg-white/5 p-6 border border-white/10 mb-4 shadow-inner">
                                <SparklesIcon className="h-10 w-10 text-fuchsia-300" />
                            </div>
                            <h3 className="text-xl font-bold text-white">No player is on stage</h3>
                            <p className="mt-2 text-sm text-neutral-400 max-w-sm">Waiting for the auctioneer to spotlight the next player lot.</p>
                        </div>
                    )}
                </section>

                {/* RIGHT COLUMN: Finance & Bidding Status */}
                <aside className="space-y-6">
                    {/* Team Finance Card */}
                    <section className="rounded-3xl border border-white/10 bg-[#16122b]/80 p-6 backdrop-blur-xl shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
                            <div className="flex items-center gap-2">
                                <ShieldCheckIcon className="h-4 w-4 text-fuchsia-400" />
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-300">Team Purse & Finance</p>
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Live Balance</span>
                        </div>

                        {team ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <Metric label="Remaining Purse" value={money(team.remaining_purse)} />
                                    <Metric label="Total Spent" value={money(team.spent_purse)} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <Metric label="Min-Squad Reserve" value={money(team.protected_reserve)} />
                                    <Metric label="Max Bid Allowed" value={money(team.max_allowed_bid)} highlight />
                                </div>

                                {/* Squad Capacity Meter */}
                                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                                    <div className="flex justify-between text-xs font-bold text-neutral-300">
                                        <span>Squad Capacity</span>
                                        <span className="text-fuchsia-300">{team.active_squad} / {team.maximum_squad} Players</span>
                                    </div>
                                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-900 border border-white/10">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-primary transition-all duration-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]"
                                            style={{ width: `${Math.min(100, (team.active_squad / Math.max(team.maximum_squad, 1)) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Minimum required squad: {team.minimum_squad}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-400 text-center py-4">Finance information unavailable.</p>
                        )}
                    </section>

                    {/* Live Bidding Standing Card */}
                    <section className={`rounded-3xl border ${bidStanding === 'Leading' ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : bidStanding === 'Cannot bid' ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-fuchsia-500/30 bg-fuchsia-500/[0.04]'} p-6 backdrop-blur-xl shadow-xl`}>
                        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
                            <div className="flex items-center gap-2">
                                <TrendingUpIcon className="h-4 w-4 text-fuchsia-400" />
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-white">Live Bidding Status</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border shadow-sm ${
                                bidStanding === 'Leading' ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300' :
                                bidStanding === 'Cannot bid' ? 'border-amber-500/40 bg-amber-500/20 text-amber-300' :
                                'border-fuchsia-500/40 bg-fuchsia-500/20 text-fuchsia-300'
                            }`}>
                                {bidStanding}
                            </span>
                        </div>

                        <div className="mt-5 text-center">
                            <p className="text-sm font-bold text-white">Bidding is Managed Offline</p>
                            <p className="mt-1 text-xs text-neutral-400 max-w-[220px] mx-auto">Signal or shout your bid to the auctioneer in the venue.</p>
                        </div>

                        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Next Valid Bid</p>
                                <p className="text-2xl font-black text-white mt-0.5">{money(renderSnapshot.next_minimum_bid)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Your Max Bid</p>
                                <p className="text-lg font-black text-fuchsia-300 mt-0.5">{money(team?.max_allowed_bid)}</p>
                            </div>
                        </div>

                        {blockedMessage ? (
                            <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs font-semibold text-amber-300 shadow-inner">
                                <AlertTriangleIcon className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                                <p>{blockedMessage}</p>
                            </div>
                        ) : null}
                    </section>
                </aside>

            </div>
        </div>
    );
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className={`rounded-2xl border p-4 backdrop-blur-md transition-all ${highlight ? 'border-fuchsia-500/40 bg-fuchsia-500/10 shadow-[0_0_15px_rgba(217,70,239,0.15)]' : 'border-white/10 bg-white/[0.03]'}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p>
            <p className={`mt-1 text-xl font-black ${highlight ? 'text-fuchsia-300' : 'text-white'}`}>{value}</p>
        </div>
    );
}
