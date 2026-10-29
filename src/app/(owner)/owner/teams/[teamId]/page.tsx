import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerStat } from '@/components/owner/OwnerStat';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { OwnerSquadRoster, SquadRosterItem } from '@/components/owner/OwnerSquadRoster';

export const metadata: Metadata = { title: 'Team Overview' };

type SquadRow = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
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

export default async function OwnerTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const api = await createClient();
    const { data: { user } } = await api.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(api, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const [
        { data: auction }, 
        { data: squadData }, 
        { data: settings }, 
        { data: wallet },
        { data: fixtures },
        { data: salesData }
    ] = await Promise.all([
        api.from('auctions').select('id, status').eq('tournament_id', team.tournament_id).maybeSingle(),
        // SOLD and lot-assigned ACTIVE players
        api.from('team_players').select('id, player_id, acquisition_type, acquisition_amount, player_profiles(id, display_name, photo_path, primary_position, secondary_position, place, height_cm, phone, date_of_birth, playing_history, jersey_name, jersey_number, jersey_size)').eq('team_id', team.id).eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
        api.from('tournament_settings').select('max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
        api.from('auction_team_wallets').select('starting_balance, spent_amount, remaining_balance').eq('team_id', team.id).maybeSingle(),
        api.from('matches').select('id, court, scheduled_at, stage_id, home_team_id, away_team_id, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)').or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).in('status', ['SCHEDULED']).order('scheduled_at', { ascending: true }).limit(1),
        api.from('auction_sales').select('auction_players!inner(player_id, attempt_number)').eq('team_id', team.id)
    ]);

    const squad: SquadRosterItem[] = ((squadData ?? []) as unknown as SquadRow[]).map((row) => {
        let label = row.acquisition_type.replaceAll('_', ' ');
        let badgeColor = 'bg-surface-muted text-text-secondary border-border';
        if (row.acquisition_type === 'AUCTION') {
            const sale = salesData?.find((s) => s.auction_players?.player_id === row.player_id);
            if (sale && sale.auction_players?.attempt_number > 1) {
                label = 'RE-AUCTION';
                badgeColor = 'bg-primary/10 text-primary border-primary/30';
            } else {
                label = 'MAIN AUCTION';
                badgeColor = 'bg-primary/10 text-primary border-primary/30';
            }
        } else if (row.acquisition_type === 'ICON_LOT') {
            label = 'Icon Lot';
            badgeColor = 'bg-warning/10 text-warning border-warning/30';
        } else if (row.acquisition_type === 'SETTER_LOT') {
            label = 'Setter Lot';
            badgeColor = 'bg-info/10 text-info border-info/30';
        }
        return {
            id: row.id,
            playerId: row.player_id,
            sourceLabel: label,
            badgeColor,
            price: row.acquisition_amount,
            player: row.player_profiles,
        };
    });

    const nextMatch = fixtures && fixtures.length > 0 ? fixtures[0] : null;
    const isAuctionActive = auction?.status === 'LIVE' || auction?.status === 'READY';

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">Overview</p>
                            <h2 className="mt-2 text-2xl font-black text-text-primary">Team Dashboard</h2>
                        </div>
                        {isAuctionActive && (
                            <Link href={`/owner/teams/${team.id}/auction`} className="rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary-hover">
                                ENTER LIVE AUCTION
                            </Link>
                        )}
                        {!isAuctionActive && nextMatch && (
                            <Link href={`/owner/teams/${team.id}/fixtures`} className="rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary-hover">
                                VIEW FIXTURE
                            </Link>
                        )}
                        {!isAuctionActive && !nextMatch && (
                            <Link href={`/owner/teams/${team.id}/squad`} className="rounded-2xl bg-surface-muted px-5 py-3 text-sm font-black text-text-primary transition hover:bg-surface-muted">
                                VIEW FINAL SQUAD
                            </Link>
                        )}
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <OwnerStat label="Squad" value={`${squad.length} / ${settings?.max_squad_size ?? '—'}`} />
                        <OwnerStat label="Remaining Purse" value={wallet ? `₹${Number(wallet.remaining_balance).toLocaleString('en-IN')}` : '—'} tone="accent" />
                        <OwnerStat label="Total Spent" value={wallet ? `₹${Number(wallet.spent_amount).toLocaleString('en-IN')}` : '—'} />
                        <OwnerStat label="Auction Status" value={auction?.status ?? 'Not Prepared'} />
                    </div>

                    <div className="mt-8 grid gap-8 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                            <section>
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">My squad</p>
                                        <h2 className="mt-2 text-2xl font-black text-text-primary">Squad Preview</h2>
                                    </div>
                                    <Link href={`/owner/teams/${team.id}/squad`} className="text-sm font-bold text-primary hover:text-primary">VIEW FULL SQUAD →</Link>
                                </div>
                                <OwnerSquadRoster squad={squad.slice(0, 4)} teamName={team.name} />
                            </section>
                        </div>
                        <div className="lg:col-span-1">
                            <section>
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-text-muted">Schedule</p>
                                        <h2 className="mt-2 text-2xl font-black text-text-primary">Next Match</h2>
                                    </div>
                                </div>
                                {nextMatch ? (
                                    <article className="mt-5 rounded-3xl border border-border bg-surface p-6 text-center">
                                        <p className="text-sm font-bold uppercase tracking-wider text-text-muted">Stage</p>
                                        <div className="my-6 flex items-center justify-center gap-4 text-xl font-black">
                                            <span className={nextMatch.home_team_id === team.id ? "text-text-primary" : "text-text-muted"}>{nextMatch.home_team?.name ?? 'TBD'}</span>
                                            <span className="text-sm font-bold text-primary">VS</span>
                                            <span className={nextMatch.away_team_id === team.id ? "text-text-primary" : "text-text-muted"}>{nextMatch.away_team?.name ?? 'TBD'}</span>
                                        </div>
                                        <p className="text-sm text-text-secondary">{nextMatch.scheduled_at ? new Date(nextMatch.scheduled_at).toLocaleString('en-IN') : 'Time TBD'}{nextMatch.court ? ` · Court ${nextMatch.court}` : ''}</p>
                                    </article>
                                ) : (
                                    <div className="mt-5 rounded-3xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-text-secondary">
                                        No upcoming matches scheduled.
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
