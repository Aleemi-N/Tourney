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
    const [amount, setAmount] = useState(initialSnapshot?.next_minimum_bid ?? 0);
    const [bidState, setBidState] = useState<'idle' | 'pending' | 'accepted' | 'rejected'>('idle');
    const [message, setMessage] = useState('');
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
        setAmount(next.next_minimum_bid ?? 0);
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

    async function placeBid() {
        if (!auctionId || !snapshot?.current_player || !snapshot.team || bidState === 'pending') return;
        setBidState('pending');
        setMessage('Submitting bid…');
        const supabase = createClient();
        const { data, error } = await supabase.rpc('place_auction_bid', {
            p_auction_id: auctionId,
            p_auction_player_id: snapshot.current_player.auction_player_id,
            p_team_id: teamId,
            p_amount: Number(amount),
            p_request_key: crypto.randomUUID(),
            p_expected_player_version: snapshot.current_player.state_version,
            p_expected_highest_bid: snapshot.highest_bid?.amount ?? 0,
        });

        if (error) {
            const reason = error.message.toLowerCase();
            setBidState('rejected');
            setMessage(
                reason.includes('stale') || reason.includes('not live')
                    ? 'This auction moved on. The authoritative state has been refreshed.'
                    : reason.includes('protected') || reason.includes('purse')
                        ? 'This bid is outside your authoritative purse allowance.'
                        : reason.includes('maximum squad')
                            ? 'Your team has reached its maximum squad size.'
                            : reason.includes('unauthorized')
                                ? 'You are not authorized to bid for this team.'
                                : 'The bid was not accepted. Review the refreshed auction state and try again.',
            );
            await refreshSnapshot();
            return;
        }

        setBidState('accepted');
        setMessage((data as { idempotent?: boolean })?.idempotent ? 'Bid request already accepted.' : 'Bid accepted.');
        await refreshSnapshot();
    }

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
    const numericAmount = Number(amount);
    const cannotSubmit = !player
        || !team?.may_bid
        || bidState === 'pending'
        || !Number.isFinite(numericAmount)
        || numericAmount < Number(renderSnapshot.next_minimum_bid ?? 0)
        || numericAmount > Number(team?.max_allowed_bid ?? 0);
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
                <section className="overflow-hidden rounded-3xl border border-fuchsia-200/15 bg-[#17132a]">
                    <div className="border-b border-white/10 px-5 py-4 sm:px-7">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/60">Current player</p>
                    </div>
                    {player ? (
                        <div className="grid gap-6 p-5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-7">
                            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#25203d]">
                                {photoUrl ? (
                                    <Image src={photoUrl} alt="" fill className="object-cover" unoptimized />
                                ) : (
                                    <span className="text-4xl font-black text-fuchsia-200">{player.player.display_name.slice(0, 1)}</span>
                                )}
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-3xl font-black tracking-tight text-white">{player.player.display_name}</h2>
                                <p className="mt-2 text-sm text-white/55">
                                    {player.player.primary_position ?? 'Position pending'}
                                    {player.player.secondary_position ? ` · ${player.player.secondary_position}` : ''}
                                </p>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-fuchsia-300 px-3 py-1.5 text-xs font-black text-[#211334]">
                                        {player.category_code ?? '—'} · {player.category_label ?? 'Uncategorized'}
                                    </span>
                                    <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/60">
                                        Category base {money(player.category_base_price)}
                                    </span>
                                    <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/60">
                                        Current base {money(player.base_price)}
                                    </span>
                                </div>
                                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                    <Metric label="Current bid" value={renderSnapshot.highest_bid ? money(renderSnapshot.highest_bid.amount) : 'No bids'} />
                                    <Metric label="Leading team" value={leading ? 'You are leading' : renderSnapshot.highest_bid?.team.name ?? 'No bids yet'} />
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 text-white/55">No player is live right now. This view refreshes when a sanitized auction event arrives.</div>
                    )}
                </section>

                <aside className="space-y-5">
                    <section className="rounded-3xl border border-white/10 bg-[#17132a] p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/60">Team finance</p>
                            <span className="text-xs font-semibold text-white/45">Authoritative</span>
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
                                <div className="mt-5 rounded-2xl border border-white/10 p-4">
                                    <div className="flex justify-between text-xs font-semibold text-white/55">
                                        <span>Squad progress</span>
                                        <span>{team.active_squad} / {team.maximum_squad}</span>
                                    </div>
                                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full rounded-full bg-fuchsia-300" style={{ width: `${Math.min(100, (team.active_squad / Math.max(team.maximum_squad, 1)) * 100)}%` }} />
                                    </div>
                                    <p className="mt-3 text-xs text-white/45">Minimum required: {team.minimum_squad}</p>
                                </div>
                            </>
                        ) : (
                            <p className="mt-5 text-sm text-white/50">Finance becomes available after auction preparation.</p>
                        )}
                    </section>

                    <section className="rounded-3xl border border-fuchsia-200/20 bg-fuchsia-300/10 p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-100/70">Your bid</p>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${bidStanding === 'Leading' ? 'bg-emerald-300/15 text-emerald-100' : bidStanding === 'Cannot bid' ? 'bg-amber-300/15 text-amber-100' : 'bg-white/10 text-white/65'}`}>
                                {bidStanding}
                            </span>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3">
                            <div>
                                <p className="text-sm text-white/55">Next valid bid</p>
                                <p className="text-3xl font-black text-white">{money(renderSnapshot.next_minimum_bid)}</p>
                            </div>
                            <span className="text-right text-xs text-white/50">Max {money(team?.max_allowed_bid)}</span>
                        </div>
                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                            <input
                                aria-label="Bid amount"
                                inputMode="decimal"
                                type="number"
                                min={renderSnapshot.next_minimum_bid ?? 0}
                                max={team?.max_allowed_bid}
                                step="any"
                                value={amount || ''}
                                onChange={(event) => setAmount(Number(event.target.value))}
                                className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/15 bg-[#17132a] px-4 py-3 text-lg font-bold text-white outline-none focus:border-fuchsia-200"
                            />
                            <button type="button" onClick={() => void placeBid()} disabled={cannotSubmit} className="min-h-12 rounded-2xl bg-fuchsia-300 px-5 text-sm font-black text-[#211334] transition hover:bg-fuchsia-200 disabled:cursor-not-allowed disabled:opacity-40">
                                {bidState === 'pending' ? 'Sending…' : 'Place bid'}
                            </button>
                        </div>
                        {blockedMessage ? <p className="mt-3 text-sm text-amber-100">{blockedMessage}</p> : null}
                        {message ? <p role="status" className={`mt-3 text-sm ${bidState === 'rejected' ? 'text-rose-200' : 'text-fuchsia-100'}`}>{message}</p> : null}
                        {renderSnapshot.highest_bid ? (
                            <p className="mt-3 text-xs text-white/45">{leading ? 'You are leading this player.' : 'You have been outbid. The snapshot above is authoritative.'}</p>
                        ) : null}
                    </section>
                </aside>
            </div>
        </div>
    );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="rounded-2xl bg-black/20 p-4">
            <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
            <p className={`mt-1 text-xl font-black ${accent ? 'text-fuchsia-200' : 'text-white'}`}>{value}</p>
        </div>
    );
}
