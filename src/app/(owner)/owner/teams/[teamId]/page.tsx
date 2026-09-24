import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import type { OwnerSquadPlayer } from '@/lib/owner/owner-auction';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerStat } from '@/components/owner/OwnerStat';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';

export const metadata: Metadata = { title: 'Team Overview' };

type SquadRow = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
    player_profiles: {
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
    } | null;
};

export default async function OwnerTeamPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(supabase, user.id);
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
        supabase.from('auctions').select('id, status').eq('tournament_id', team.tournament_id).maybeSingle(),
        // SOLD and lot-assigned ACTIVE players
        supabase.from('team_players').select('id, player_id, acquisition_type, acquisition_amount, player_profiles(display_name, photo_path, primary_position, secondary_position)').eq('team_id', team.id).eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
        supabase.from('tournament_settings').select('max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
        supabase.from('auction_team_wallets').select('starting_balance, spent_amount, remaining_balance').eq('team_id', team.id).maybeSingle(),
        supabase.from('matches').select('id, court, scheduled_at, stage_id, home_team_id, away_team_id, home_team:teams!home_team_id(name), away_team:teams!away_team_id(name)').or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).in('status', ['SCHEDULED']).order('scheduled_at', { ascending: true }).limit(1),
        supabase.from('auction_sales').select('auction_players!inner(player_id, attempt_number)').eq('team_id', team.id)
    ]);

    const squad = ((squadData ?? []) as unknown as SquadRow[]).map((row): OwnerSquadPlayer => {
        let label = row.acquisition_type.replaceAll('_', ' ');
        if (row.acquisition_type === 'AUCTION') {
            const sale = salesData?.find((s) => s.auction_players?.player_id === row.player_id);
            if (sale && sale.auction_players?.attempt_number > 1) {
                label = 'RE-AUCTION';
            } else {
                label = 'MAIN AUCTION';
            }
        }
        return {
            id: row.id,
            player_id: row.player_id,
            acquisition_type: label,
            acquisition_amount: row.acquisition_amount,
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
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Overview</p>
                            <h2 className="mt-2 text-2xl font-black text-white">Team Dashboard</h2>
                        </div>
                        {isAuctionActive && (
                            <Link href={`/owner/teams/${team.id}/auction`} className="rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black text-[#211334] transition hover:bg-fuchsia-200">
                                ENTER LIVE AUCTION
                            </Link>
                        )}
                        {!isAuctionActive && nextMatch && (
                            <Link href={`/owner/teams/${team.id}/fixtures`} className="rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black text-[#211334] transition hover:bg-fuchsia-200">
                                VIEW FIXTURE
                            </Link>
                        )}
                        {!isAuctionActive && !nextMatch && (
                            <Link href={`/owner/teams/${team.id}/squad`} className="rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15">
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
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">My squad</p>
                                        <h2 className="mt-2 text-2xl font-black text-white">Squad Preview</h2>
                                    </div>
                                    <Link href={`/owner/teams/${team.id}/squad`} className="text-sm font-bold text-fuchsia-300 hover:text-fuchsia-200">VIEW FULL SQUAD →</Link>
                                </div>
                                {squad.length === 0 ? (
                                    <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-sm text-white/55">
                                        No players are assigned to this team yet.
                                    </div>
                                ) : (
                                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                                        {squad.slice(0, 4).map((entry) => (
                                            <article key={entry.id} className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#17132a] p-4">
                                                <div className="min-w-0">
                                                    <h3 className="truncate font-bold text-white">{entry.player?.display_name ?? 'Player'}</h3>
                                                    <p className="mt-1 truncate text-sm text-white/45">{entry.player?.primary_position ?? 'Position pending'}{entry.player?.secondary_position ? ` · ${entry.player.secondary_position}` : ''}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-fuchsia-200/70">{entry.acquisition_type.replaceAll('_', ' ')}</p>
                                                    {entry.acquisition_amount !== null ? <p className="mt-1 text-sm font-bold text-white">₹{Number(entry.acquisition_amount).toLocaleString('en-IN')}</p> : null}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        </div>
                        <div className="lg:col-span-1">
                            <section>
                                <div className="flex items-end justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Schedule</p>
                                        <h2 className="mt-2 text-2xl font-black text-white">Next Match</h2>
                                    </div>
                                </div>
                                {nextMatch ? (
                                    <article className="mt-5 rounded-3xl border border-white/10 bg-white/3 p-6 text-center">
                                        <p className="text-sm font-bold uppercase tracking-wider text-white/40">Stage</p>
                                        <div className="my-6 flex items-center justify-center gap-4 text-xl font-black">
                                            <span className={nextMatch.home_team_id === team.id ? "text-white" : "text-white/40"}>{nextMatch.home_team?.name ?? 'TBD'}</span>
                                            <span className="text-sm font-bold text-fuchsia-300">VS</span>
                                            <span className={nextMatch.away_team_id === team.id ? "text-white" : "text-white/40"}>{nextMatch.away_team?.name ?? 'TBD'}</span>
                                        </div>
                                        <p className="text-sm text-white/55">{nextMatch.scheduled_at ? new Date(nextMatch.scheduled_at).toLocaleString('en-IN') : 'Time TBD'}{nextMatch.court ? ` · Court ${nextMatch.court}` : ''}</p>
                                    </article>
                                ) : (
                                    <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-center text-sm text-white/55">
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
