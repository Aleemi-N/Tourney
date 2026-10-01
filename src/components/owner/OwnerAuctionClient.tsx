'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import type { OwnerSnapshot } from '@/lib/owner/owner-auction';

const money = (value: number | null | undefined) =>
    `₹${Math.max(0, Number(value ?? 0)).toLocaleString('en-IN')}`;

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
        setConnectionState('Live snapshot');
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
                if (status === 'SUBSCRIBED') setConnectionState('Live updates connected');
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
                ? 'Waiting for the next player.'
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
            <section className="rounded-3xl border border-white/10 bg-white/3 p-6 text-white/70">
                Auction preparation is not available for this team yet.
            </section>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/60">Live auction</p>
                    <p className="mt-1 text-sm text-white/50">{connectionState}</p>
                </div>
                {snapshot?.auction ? (
                    <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                        {snapshot.auction.status}
                    </span>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
                <section className="overflow-hidden rounded-3xl border border-glass-border bg-surface-raised/80 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.15)] relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-50" />
                    <div className="relative z-10 border-b border-glass-border px-6 py-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Current player</p>
                    </div>
                    {player ? (
                        <div className="relative z-10 grid gap-6 p-6 sm:grid-cols-[12rem_minmax(0,1fr)] lg:p-8">
                            <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-glass-border bg-surface shadow-inner">
                                {photoUrl ? (
                                    <Image src={photoUrl} alt="" fill className="object-cover object-top" unoptimized />
                                ) : (
                                    <span className="text-6xl font-black text-slate-500 opacity-20 tracking-widest drop-shadow-sm">
                                        {player.player.display_name.slice(0, 1).toUpperCase()}
                                    </span>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-surface-raised/80 via-transparent to-transparent" />
                            </div>
                            <div className="min-w-0 flex flex-col justify-center">
                                <h2 className="truncate text-4xl sm:text-5xl font-black tracking-tight text-text-primary drop-shadow-md">{player.player.display_name}</h2>
                                <p className="mt-2 text-sm sm:text-base font-bold text-text-secondary">
                                    {player.player.primary_position ?? 'Position pending'}
                                    {player.player.secondary_position ? ` · ${player.player.secondary_position}` : ''}
                                </p>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <span className="rounded-lg border border-primary/30 bg-primary/20 backdrop-blur-md px-3 py-1.5 text-xs font-black uppercase tracking-wider text-primary shadow-sm">
                                        Cat {player.category_code ?? '—'}{player.category_label ? ` — ${player.category_label}` : ''}
                                    </span>
                                </div>
                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-2xl border border-glass-border bg-surface-muted/50 p-4 backdrop-blur-md shadow-inner">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Cat Base</p>
                                        <p className="mt-1 text-xl font-bold text-text-primary drop-shadow-sm">{money(player.category_base_price)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-glass-border bg-surface-muted/50 p-4 backdrop-blur-md shadow-inner">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Op. Base</p>
                                        <p className="mt-1 text-xl font-bold text-text-primary drop-shadow-sm">{money(player.base_price)}</p>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <div className={`rounded-2xl border p-4 backdrop-blur-md shadow-inner transition-colors duration-500 ${renderSnapshot.highest_bid ? 'border-success/40 bg-success/10' : 'border-glass-border bg-surface-muted/50'}`}>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Current Bid</p>
                                        <p className={`mt-1 text-2xl font-black drop-shadow-sm ${renderSnapshot.highest_bid ? 'text-success' : 'text-text-muted'}`}>
                                            {renderSnapshot.highest_bid ? money(renderSnapshot.highest_bid.amount) : 'No bids'}
                                        </p>
                                    </div>
                                    <div className="rounded-2xl border border-glass-border bg-surface-muted/50 p-4 backdrop-blur-md shadow-inner">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">Leading Team</p>
                                        <p className="mt-1 truncate text-lg font-bold text-text-primary">
                                            {leading ? 'You are leading' : renderSnapshot.highest_bid?.team.name ?? 'No bids yet'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="relative z-10 flex flex-col items-center justify-center p-12 text-center">
                            <div className="rounded-full bg-surface-muted p-5 border border-glass-border shadow-inner mb-4">
                                <span className="text-4xl">⏳</span>
                            </div>
                            <h3 className="text-xl font-bold text-text-primary">No player is live</h3>
                            <p className="mt-2 text-text-secondary">This view refreshes when the auctioneer starts the next lot.</p>
                        </div>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-3xl border border-glass-border bg-surface-raised/60 p-5 sm:p-6 backdrop-blur-md shadow-md">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Team finance</p>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Authoritative</span>
                        </div>
                        {team ? (
                            <>
                                <div className="mt-5 grid grid-cols-2 gap-3">
                                    <Metric label="Remaining" value={money(team.remaining_purse)} />
                                    <Metric label="Spent" value={money(team.spent_purse)} />
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <Metric label="Min-squad reserve" value={money(team.protected_reserve)} />
                                    <Metric label="Maximum bid" value={money(team.max_allowed_bid)} accent />
                                </div>
                                <div className="mt-5 rounded-2xl border border-glass-border bg-surface-muted/50 p-4 shadow-inner">
                                    <div className="flex justify-between text-xs font-bold text-text-secondary">
                                        <span>Squad progress</span>
                                        <span>{team.active_squad} / {team.maximum_squad}</span>
                                    </div>
                                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface">
                                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-hover shadow-[0_0_10px_rgba(var(--primary),0.5)]" style={{ width: `${Math.min(100, (team.active_squad / Math.max(team.maximum_squad, 1)) * 100)}%` }} />
                                    </div>
                                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">Minimum required: {team.minimum_squad}</p>
                                </div>
                            </>
                        ) : (
                            <p className="mt-5 text-sm text-text-secondary text-center">Finance becomes available after auction preparation.</p>
                        )}
                    </section>

                    <section className={`rounded-3xl border ${bidStanding === 'Leading' ? 'border-emerald-500/30 bg-emerald-500/5' : bidStanding === 'Cannot bid' ? 'border-amber-500/30 bg-amber-500/5' : 'border-primary/20 bg-primary/5'} p-5 sm:p-6 backdrop-blur-md shadow-md transition-colors duration-500`}>
                        <div className="flex items-center justify-between gap-3">
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${bidStanding === 'Leading' ? 'text-emerald-400' : bidStanding === 'Cannot bid' ? 'text-amber-400' : 'text-primary'}`}>Live Bidding</p>
                            <span className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider shadow-sm border ${bidStanding === 'Leading' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : bidStanding === 'Cannot bid' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-surface-muted border-glass-border text-text-secondary'}`}>
                                {bidStanding}
                            </span>
                        </div>
                        <div className="mt-6 flex flex-col gap-2">
                            <p className="text-sm font-bold text-text-primary text-center drop-shadow-sm">Bidding is managed offline</p>
                            <p className="text-xs text-text-secondary text-center max-w-[200px] mx-auto">Raise your paddle or shout your bid to the auctioneer.</p>
                        </div>
                        <div className={`mt-6 border-t ${bidStanding === 'Leading' ? 'border-emerald-500/20' : bidStanding === 'Cannot bid' ? 'border-amber-500/20' : 'border-primary/20'} pt-5`}>
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Next valid bid</p>
                                    <p className="text-3xl font-black text-text-primary drop-shadow-sm">{money(renderSnapshot.next_minimum_bid)}</p>
                                </div>
                                <span className="text-right text-[10px] font-bold uppercase tracking-wider text-text-muted">Max {money(team?.max_allowed_bid)}</span>
                            </div>
                        </div>
                        {blockedMessage ? <p className="mt-5 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs font-bold text-amber-400 text-center shadow-inner">{blockedMessage}</p> : null}
                    </section>
                </aside>
            </div>
        </div>
    );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-2xl border border-glass-border bg-surface-muted/50 p-4 backdrop-blur-md shadow-inner transition-colors duration-300 hover:bg-surface-muted">
            <p className="text-[10px] font-black uppercase tracking-wider text-text-muted">{label}</p>
            <p className={`mt-1 text-xl font-black drop-shadow-sm ${accent ? 'text-primary' : 'text-text-primary'}`}>{value}</p>
        </div>
    );
}
