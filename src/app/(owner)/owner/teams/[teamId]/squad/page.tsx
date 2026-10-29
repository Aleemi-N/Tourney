import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerStat } from '@/components/owner/OwnerStat';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { OwnerSquadRoster, SquadRosterItem } from '@/components/owner/OwnerSquadRoster';

export const metadata: Metadata = { title: 'My Squad | Team Owner' };

type SquadRow = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
    joined_at: string;
    player_profiles: {
        id?: string;
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
        place: string | null;
        height_cm: number | null;
        phone?: string | null;
        date_of_birth?: string | null;
        playing_history?: string | null;
        jersey_name?: string | null;
        jersey_number?: string | null;
        jersey_size?: string | null;
    } | null;
};

export default async function OwnerSquadPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const api = await createClient();
    const { data: { user } } = await api.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(api, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const [
        { data: settings },
        { data: squadData },
        { data: salesData }
    ] = await Promise.all([
        api.from('tournament_settings').select('min_squad_size, max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
        api.from('team_players').select('id, player_id, acquisition_type, acquisition_amount, joined_at, player_profiles(id, display_name, photo_path, primary_position, secondary_position, place, height_cm, phone, date_of_birth, playing_history, jersey_name, jersey_number, jersey_size)').eq('team_id', team.id).eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
        api.from('auction_sales').select('auction_players!inner(player_id, attempt_number)').eq('team_id', team.id)
    ]);

    const rawSquad = (squadData ?? []) as unknown as SquadRow[];

    let auctionCount = 0;
    let lotCount = 0;
    let manualCount = 0;

    const squad: SquadRosterItem[] = rawSquad.map((row) => {
        const rawType = row.acquisition_type;
        let sourceLabel = 'Manual Assignment';
        let badgeColor = 'bg-surface-muted text-text-secondary border-border';

        if (rawType === 'ICON_LOT') {
            sourceLabel = 'Icon Lot';
            badgeColor = 'bg-warning/10 text-warning border-warning/30';
            lotCount++;
        } else if (rawType === 'SETTER_LOT') {
            sourceLabel = 'Setter Lot';
            badgeColor = 'bg-info/10 text-info border-info/30';
            lotCount++;
        } else if (rawType === 'AUCTION') {
            const sale = salesData?.find((s) => s.auction_players?.player_id === row.player_id);
            if (sale && sale.auction_players?.attempt_number > 1) {
                sourceLabel = 'Re-auction';
                badgeColor = 'bg-primary/10 text-primary border-primary/30';
            } else {
                sourceLabel = 'Main Auction';
                badgeColor = 'bg-primary/10 text-primary border-primary/30';
            }
            auctionCount++;
        } else if (rawType === 'MANUAL' || rawType === 'MANUAL_ASSIGNMENT') {
            sourceLabel = 'Manual Assignment';
            badgeColor = 'bg-success/10 text-success border-success/30';
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
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Squad Management</p>
                            <h1 className="mt-2 text-3xl font-black text-text-primary sm:text-4xl">My Squad</h1>
                            <p className="mt-1 text-sm text-text-secondary">Authoritative roster of all acquired players for {team.name}.</p>
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
                        <div className="flex items-center justify-between border-b border-border pb-4">
                            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
                                Roster Players
                                <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold text-text-secondary">
                                    {squadCount}
                                </span>
                            </h2>
                        </div>

                        <OwnerSquadRoster squad={squad} teamName={team.name} />
                    </section>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
