import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { OwnerPlayerPoolGrid, PlayerPoolItem } from '@/components/owner/OwnerPlayerPoolGrid';

export const metadata: Metadata = { title: 'Player Pool | Team Owner' };

type PlayerRow = {
    id: string;
    player_id: string;
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

export default async function OwnerPlayerPoolPage({
    params,
    searchParams,
}: {
    params: Promise<{ teamId: string }>;
    searchParams: Promise<{ filter?: string }>;
}) {
    const { teamId } = await params;
    const { filter = 'all' } = await searchParams;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(supabase, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const [{ data: registrationsData }, { data: auction }, { data: categoriesData }] = await Promise.all([
        supabase
            .from('player_tournament_registrations')
            .select('id, player_id, player_profiles(id, display_name, photo_path, primary_position, secondary_position, place, height_cm, phone, date_of_birth, playing_history, jersey_name, jersey_number, jersey_size)')
            .eq('tournament_id', team.tournament_id)
            .eq('status', 'APPROVED'),
        supabase
            .from('auctions')
            .select('id')
            .eq('tournament_id', team.tournament_id)
            .maybeSingle(),
        supabase
            .from('tournament_auction_categories')
            .select('category_code, display_name, base_price, display_order')
            .eq('tournament_id', team.tournament_id)
            .order('display_order', { ascending: true }),
    ]);

    const categoryMap = new Map<string, { name: string; basePrice: number; order: number }>();
    if (categoriesData) {
        for (const cat of categoriesData) {
            categoryMap.set(cat.category_code, {
                name: cat.display_name,
                basePrice: Number(cat.base_price),
                order: cat.display_order ?? 99,
            });
        }
    }

    const auctionPlayersMap = new Map<string, {
        status: string;
        categoryCode: string | null;
        categoryBasePrice: number | null;
        basePrice: number | null;
        soldAmount?: number | null;
        soldTeamName?: string | null;
    }>();

    if (auction?.id) {
        const { data: apList } = await supabase
            .from('auction_players')
            .select('id, player_id, status, category_code, category_base_price, base_price')
            .eq('auction_id', auction.id);

        if (apList && apList.length > 0) {
            const apIds = apList.map(ap => ap.id);
            const { data: salesList } = await supabase
                .from('auction_sales')
                .select('auction_player_id, sold_amount, team_id, teams(name)')
                .in('auction_player_id', apIds);

            const salesMap = new Map<string, { amount: number; teamName: string }>();
            if (salesList) {
                for (const sale of salesList) {
                    const t = Array.isArray(sale.teams) ? sale.teams[0] : sale.teams;
                    salesMap.set(sale.auction_player_id, {
                        amount: sale.sold_amount,
                        teamName: t?.name ?? 'Team',
                    });
                }
            }

            for (const ap of apList) {
                const sale = salesMap.get(ap.id);
                auctionPlayersMap.set(ap.player_id, {
                    status: ap.status,
                    categoryCode: ap.category_code,
                    categoryBasePrice: ap.category_base_price,
                    basePrice: ap.base_price,
                    soldAmount: sale?.amount,
                    soldTeamName: sale?.teamName,
                });
            }
        }
    }

    const rawPlayers = (registrationsData ?? []) as unknown as PlayerRow[];

    const allPlayers: PlayerPoolItem[] = rawPlayers.map((row) => {
        const auctionInfo = auctionPlayersMap.get(row.player_id);
        const photoUrl = resolvePublicStorageUrl(supabase, 'avatars', row.player_profiles?.photo_path);
        const categoryCode = auctionInfo?.categoryCode ?? 'C';
        const catDetail = categoryMap.get(categoryCode);
        const basePrice = auctionInfo?.categoryBasePrice ?? catDetail?.basePrice ?? auctionInfo?.basePrice ?? (categoryCode === 'A' ? 500 : categoryCode === 'B' ? 300 : 100);
        const catOrder = catDetail?.order ?? (categoryCode === 'A' ? 1 : categoryCode === 'B' ? 2 : categoryCode === 'C' ? 3 : 99);

        return {
            id: row.id,
            playerId: row.player_id,
            player: row.player_profiles,
            photoUrl,
            status: auctionInfo?.status ?? 'PENDING',
            categoryCode,
            catName: catDetail?.name ?? `Category ${categoryCode}`,
            catOrder,
            basePrice,
            soldAmount: auctionInfo?.soldAmount ?? null,
            soldTeamName: auctionInfo?.soldTeamName ?? null,
        };
    }).sort((a, b) => {
        if (a.catOrder !== b.catOrder) return a.catOrder - b.catOrder;
        if (b.basePrice !== a.basePrice) return b.basePrice - a.basePrice;
        return (a.player?.display_name || '').localeCompare(b.player?.display_name || '');
    });

    const activeFilter = filter.toUpperCase();
    const filteredPlayers = allPlayers.filter((p) => {
        if (filter === 'sold') return p.status === 'SOLD';
        if (filter === 'unsold') return p.status === 'UNSOLD';
        if (filter === 'available') return p.status === 'PENDING' || p.status === 'OPEN';
        if (['A', 'B', 'C'].includes(activeFilter)) return p.categoryCode === activeFilter;
        return true;
    });

    const soldCount = allPlayers.filter(p => p.status === 'SOLD').length;
    const unsoldCount = allPlayers.filter(p => p.status === 'UNSOLD').length;
    const availableCount = allPlayers.filter(p => p.status === 'PENDING' || p.status === 'OPEN').length;

    const catACount = allPlayers.filter(p => p.categoryCode === 'A').length;
    const catBCount = allPlayers.filter(p => p.categoryCode === 'B').length;
    const catCCount = allPlayers.filter(p => p.categoryCode === 'C').length;

    const catAPrice = categoryMap.get('A')?.basePrice ?? 500;
    const catBPrice = categoryMap.get('B')?.basePrice ?? 300;
    const catCPrice = categoryMap.get('C')?.basePrice ?? 100;

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Tournament Players</p>
                            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Player Pool</h1>
                            <p className="mt-1 text-sm text-white/55">All registered players grouped by Category & Base Price for {team.tournament_name}.</p>
                        </div>

                        {/* Category & Status Filter Tabs */}
                        <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/5 p-1.5 backdrop-blur-md">
                            <a
                                href={`/owner/teams/${team.id}/players?filter=all`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'all' ? 'bg-primary text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                            >
                                All ({allPlayers.length})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=a`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'a' ? 'bg-fuchsia-600 text-white shadow-md' : 'text-fuchsia-300/80 hover:text-white'}`}
                            >
                                Cat A · ₹{catAPrice} ({catACount})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=b`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'b' ? 'bg-blue-600 text-white shadow-md' : 'text-blue-300/80 hover:text-white'}`}
                            >
                                Cat B · ₹{catBPrice} ({catBCount})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=c`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'c' ? 'bg-emerald-600 text-white shadow-md' : 'text-emerald-300/80 hover:text-white'}`}
                            >
                                Cat C · ₹{catCPrice} ({catCCount})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=available`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'available' ? 'bg-primary text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                            >
                                Available ({availableCount})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=sold`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'sold' ? 'bg-emerald-500 text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                            >
                                Sold ({soldCount})
                            </a>
                            <a
                                href={`/owner/teams/${team.id}/players?filter=unsold`}
                                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${filter === 'unsold' ? 'bg-rose-500 text-white shadow-md' : 'text-white/60 hover:text-white'}`}
                            >
                                Unsold ({unsoldCount})
                            </a>
                        </div>
                    </div>

                    {/* Player List */}
                    <section className="mt-8">
                        <OwnerPlayerPoolGrid players={filteredPlayers} />
                    </section>
                </div>
            </div>
        </OwnerPortalShell>
    );
}
