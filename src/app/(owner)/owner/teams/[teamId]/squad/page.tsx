import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerStat } from '@/components/owner/OwnerStat';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { UserIcon } from '@heroicons/react/24/solid';

export const metadata: Metadata = { title: 'My Squad | Team Owner' };

type SquadRow = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
    joined_at: string;
    player_profiles: {
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
        place: string | null;
        height_cm: number | null;
    } | null;
};

export default async function OwnerSquadPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(supabase, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const [
        { data: settings },
        { data: squadData },
        { data: salesData }
    ] = await Promise.all([
        supabase.from('tournament_settings').select('min_squad_size, max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
        supabase.from('team_players').select('id, player_id, acquisition_type, acquisition_amount, joined_at, player_profiles(display_name, photo_path, primary_position, secondary_position, place, height_cm)').eq('team_id', team.id).eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
        supabase.from('auction_sales').select('auction_players!inner(player_id, attempt_number)').eq('team_id', team.id)
    ]);

    const rawSquad = (squadData ?? []) as unknown as SquadRow[];

    let auctionCount = 0;
    let lotCount = 0;
    let manualCount = 0;

    const squad = rawSquad.map((row) => {
        const rawType = row.acquisition_type;
        let sourceLabel = 'Manual Assignment';
        let badgeColor = 'bg-slate-400/10 text-slate-300 border-slate-400/30';

        if (rawType === 'ICON_LOT') {
            sourceLabel = 'Icon Lot';
            badgeColor = 'bg-amber-400/10 text-amber-300 border-amber-400/30';
            lotCount++;
        } else if (rawType === 'SETTER_LOT') {
            sourceLabel = 'Setter Lot';
            badgeColor = 'bg-sky-400/10 text-sky-300 border-sky-400/30';
            lotCount++;
        } else if (rawType === 'AUCTION') {
            const sale = salesData?.find((s) => s.auction_players?.player_id === row.player_id);
            if (sale && sale.auction_players?.attempt_number > 1) {
                sourceLabel = 'Re-auction';
                badgeColor = 'bg-purple-400/10 text-purple-300 border-purple-400/30';
            } else {
                sourceLabel = 'Main Auction';
                badgeColor = 'bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/30';
            }
            auctionCount++;
        } else if (rawType === 'MANUAL' || rawType === 'MANUAL_ASSIGNMENT') {
            sourceLabel = 'Manual Assignment';
            badgeColor = 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30';
            manualCount++;
        } else {
            sourceLabel = rawType.replaceAll('_', ' ');
        }

        return {
            id: row.id,
            playerId: row.player_id,
            sourceLabel,
            badgeColor,
            price: row.acquisition_amount,
            player: row.player_profiles,
        };
    });

    const squadCount = squad.length;
    const maxSquadSize = settings?.max_squad_size ?? '—';
    const minSquadSize = settings?.min_squad_size ?? '—';

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Squad Management</p>
                            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">My Squad</h1>
                            <p className="mt-1 text-sm text-white/55">Authoritative roster of all acquired players for {team.name}.</p>
                        </div>
                    </div>

                    {/* Summary Header Cards */}
                    <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                        <OwnerStat label="Squad" value={`${squadCount} / ${maxSquadSize}`} tone="accent" />
                        <OwnerStat label="Minimum Requirement" value={`${minSquadSize}`} />
                        <OwnerStat label="Auction Players" value={`${auctionCount}`} />
                        <OwnerStat label="Lot Players" value={`${lotCount}`} />
                        <OwnerStat label="Manual Assignments" value={`${manualCount}`} />
                    </div>

                    {/* Squad Player List */}
                    <section className="mt-8">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                Roster Players
                                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/70">
                                    {squadCount}
                                </span>
                            </h2>
                        </div>

                        {squad.length === 0 ? (
                            <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/3 p-12 text-center text-sm text-white/55">
                                No players are assigned to this squad yet.
                            </div>
                        ) : (
                            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {squad.map((item) => {
                                    const displayName = item.player?.display_name ?? 'Player';
                                    const primaryPos = item.player?.primary_position?.replaceAll('_', ' ') ?? 'Position Pending';
                                    const secondaryPos = item.player?.secondary_position?.replaceAll('_', ' ');

                                    return (
                                        <article
                                            key={item.id}
                                            className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#17132a] p-5 shadow-lg transition hover:border-white/20"
                                        >
                                            <div className="flex items-start gap-4">
                                                {item.player?.photo_path ? (
                                                    <img
                                                        src={item.player.photo_path}
                                                        alt={displayName}
                                                        className="h-14 w-14 shrink-0 rounded-2xl object-cover border border-white/10"
                                                    />
                                                ) : (
                                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-400/10 text-fuchsia-300 border border-fuchsia-400/20">
                                                        <UserIcon className="h-7 w-7" />
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="truncate text-base font-bold text-white">{displayName}</h3>
                                                    <p className="mt-0.5 truncate text-xs font-semibold text-fuchsia-300/90">
                                                        {primaryPos}
                                                        {secondaryPos ? ` · ${secondaryPos}` : ''}
                                                    </p>
                                                    {item.player?.place ? (
                                                        <p className="mt-1 truncate text-[11px] text-white/40">
                                                            {item.player.place}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                                                <span className={`inline-block rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.badgeColor}`}>
                                                    {item.sourceLabel}
                                                </span>
                                                <span className="font-mono text-xs font-bold text-white">
                                                    {item.price !== null && item.price !== undefined
                                                        ? `₹${Number(item.price).toLocaleString('en-IN')}`
                                                        : '—'}
                                                </span>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
