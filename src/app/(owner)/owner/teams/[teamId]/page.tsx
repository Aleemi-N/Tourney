import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import type { OwnerSquadPlayer } from '@/lib/owner/owner-auction';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerStat } from '@/components/owner/OwnerStat';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';

export const metadata: Metadata = { title: 'My Squad' };

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

    const [{ data: auction }, { data: squadData }, { data: settings }] = await Promise.all([
        supabase.from('auctions').select('id, status, starting_purse, minimum_bid_increment, minimum_acquisition_reserve_price').eq('tournament_id', team.tournament_id).maybeSingle(),
        supabase.from('team_players').select('id, player_id, acquisition_type, acquisition_amount, player_profiles(display_name, photo_path, primary_position, secondary_position)').eq('team_id', team.id).eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
        supabase.from('tournament_settings').select('max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
    ]);

    const squad = ((squadData ?? []) as unknown as SquadRow[]).map((row): OwnerSquadPlayer => ({
        id: row.id,
        player_id: row.player_id,
        acquisition_type: row.acquisition_type,
        acquisition_amount: row.acquisition_amount,
        player: row.player_profiles,
    }));

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Team overview</p><h2 className="mt-2 text-2xl font-black text-white">Your squad and auction position</h2></div>
                        <Link href={`/owner/teams/${team.id}/auction`} className="rounded-2xl bg-fuchsia-300 px-5 py-3 text-sm font-black text-[#211334] transition hover:bg-fuchsia-200">Open live auction</Link>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <OwnerStat label="Squad count" value={`${squad.length} / ${settings?.max_squad_size ?? '—'}`} />
                        <OwnerStat label="Auction status" value={auction?.status ?? 'Not prepared'} />
                        <OwnerStat label="Starting purse" value={auction ? `₹${Number(auction.starting_purse).toLocaleString('en-IN')}` : '—'} />
                        <OwnerStat label="Reserve floor" value={auction?.minimum_acquisition_reserve_price ? `₹${Number(auction.minimum_acquisition_reserve_price).toLocaleString('en-IN')}` : '—'} tone="accent" />
                    </div>

                    <section className="mt-10">
                        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">My squad</p><h2 className="mt-2 text-2xl font-black text-white">Assigned players</h2></div><span className="text-sm text-white/45">{squad.length} active</span></div>
                        {squad.length === 0 ? <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-sm text-white/55">No players are assigned to this team yet. Auction SOLD and lot-assigned ACTIVE players will appear here after authoritative refresh.</div> : <div className="mt-5 grid gap-3 md:grid-cols-2">{squad.map((entry) => <article key={entry.id} className="flex min-w-0 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#17132a] p-4"><div className="min-w-0"><h3 className="truncate font-bold text-white">{entry.player?.display_name ?? 'Player'}</h3><p className="mt-1 truncate text-sm text-white/45">{entry.player?.primary_position ?? 'Position pending'}{entry.player?.secondary_position ? ` · ${entry.player.secondary_position}` : ''}</p></div><div className="shrink-0 text-right"><p className="text-xs font-bold uppercase tracking-wider text-fuchsia-200/70">{entry.acquisition_type.replaceAll('_', ' ')}</p>{entry.acquisition_amount !== null ? <p className="mt-1 text-sm font-bold text-white">₹{Number(entry.acquisition_amount).toLocaleString('en-IN')}</p> : null}</div></article>)}</div>}
                    </section>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
