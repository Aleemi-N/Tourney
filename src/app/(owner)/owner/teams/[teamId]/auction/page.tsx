import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import type { OwnerSnapshot } from '@/lib/owner/owner-auction';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { OwnerAuctionClient } from '@/components/owner/OwnerAuctionClient';

export const metadata: Metadata = { title: 'Live Auction' };

export default async function OwnerAuctionPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(supabase, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const { data: auction } = await supabase.from('auctions').select('id').eq('tournament_id', team.tournament_id).maybeSingle();
    let initialSnapshot: OwnerSnapshot | null = null;
    if (auction?.id) {
        const { data } = await supabase.rpc('get_auction_owner_state', { p_auction_id: auction.id, p_team_id: team.id });
        if (data) initialSnapshot = data as OwnerSnapshot;
    }

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <OwnerAuctionClient auctionId={auction?.id ?? null} teamId={team.id} initialSnapshot={initialSnapshot} />
                </div>
            </div>
        </OwnerPortalShell>
    );
}