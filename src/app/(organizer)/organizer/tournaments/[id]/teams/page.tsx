import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import { AssignPlayerButton } from '@/components/organizer/AssignPlayerButton';
import type { EligiblePlayer } from '@/components/organizer/AssignPlayerModal';
import { TeamColorsForm, TeamRenameForm } from '@/components/organizer/TeamRenameForm';
import { OrganizerTeamsSquadRoster, OrganizerSquadPlayer } from '@/components/organizer/OrganizerTeamsSquadRoster';

export const metadata: Metadata = {
    title: 'Teams & Squads | Organizer',
};

type SquadEntry = OrganizerSquadPlayer;

export default async function OrganizerTeamsPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const supabase = await createClient();

    const { data: auction } = await supabase.from('auctions').select('id').eq('tournament_id', id).maybeSingle();

    const [
        { data: tournament },
        { data: settings },
        { data: teamsData },
        { data: wallets },
        { data: playersData },
        { data: salesData },
        { data: approvedRegs },
        { data: liveAuctionPlayers }
    ] = await Promise.all([
        supabase.from('tournaments').select('id, name, status').eq('id', id).single(),
        supabase.from('tournament_settings').select('min_squad_size, max_squad_size, auction_starting_purse').eq('tournament_id', id).single(),
        supabase.from('teams').select('id, name, short_name, logo_path, status, primary_color, secondary_color').eq('tournament_id', id).order('name'),
        auction ? supabase.from('auction_team_wallets').select('team_id, starting_balance, spent_amount, remaining_balance').eq('auction_id', auction.id) : Promise.resolve({ data: [] }),
        supabase.from('team_players').select('id, team_id, player_id, acquisition_type, acquisition_amount, player_profiles(id, display_name, photo_path, primary_position, secondary_position, place, height_cm, phone, date_of_birth, playing_history, jersey_name, jersey_number, jersey_size)').eq('tournament_id', id).eq('status', 'ACTIVE'),
        auction ? supabase.from('auction_sales').select('team_id, auction_players!inner(player_id, attempt_number)') : Promise.resolve({ data: [] }),
        supabase.from('player_tournament_registrations').select('id, player_id, status, player_profiles(id, display_name, primary_position, secondary_position, photo_path)').eq('tournament_id', id).eq('status', 'APPROVED'),
        auction ? supabase.from('auction_players').select('player_id').eq('auction_id', auction.id).eq('status', 'LIVE') : Promise.resolve({ data: [] })
    ]);

    if (!tournament) notFound();

    const assignedPlayerIds = new Set((playersData ?? []).map(p => p.player_id));
    const livePlayerIds = new Set((liveAuctionPlayers ?? []).map(p => p.player_id));

    const eligiblePlayers: EligiblePlayer[] = (approvedRegs ?? [])
        .filter(r => r.player_profiles && !assignedPlayerIds.has(r.player_id) && !livePlayerIds.has(r.player_id))
        .map(r => {
            const prof = r.player_profiles as unknown as {
                id: string;
                display_name: string;
                primary_position: string;
                secondary_position: string | null;
                photo_path: string | null;
            };
            return {
                id: r.player_id,
                registrationId: r.id,
                displayName: prof.display_name,
                primaryPosition: prof.primary_position,
                secondaryPosition: prof.secondary_position,
                photoPath: prof.photo_path,
                status: r.status,
            };
        });

    const defaultPurse = Number(settings?.auction_starting_purse ?? 10000);

    const teams = (teamsData ?? []).map((t) => {
        const wallet = wallets?.find(w => w.team_id === t.id);
        const squadRaw = playersData?.filter(p => p.team_id === t.id) ?? [];
        const squad: SquadEntry[] = squadRaw.map(p => {
            let label = p.acquisition_type.replaceAll('_', ' ');
            if (p.acquisition_type === 'AUCTION') {
                const sale = salesData?.find((s) => s.team_id === t.id && s.auction_players?.player_id === p.player_id);
                if (sale && sale.auction_players?.attempt_number > 1) {
                    label = 'RE-AUCTION';
                } else {
                    label = 'MAIN AUCTION';
                }
            } else if (p.acquisition_type === 'MANUAL' || p.acquisition_type === 'MANUAL_ASSIGNMENT') {
                label = 'MANUAL ASSIGNMENT';
            }
            return {
                id: p.id,
                player_id: p.player_id,
                acquisition_type: label,
                acquisition_amount: p.acquisition_amount,
                player: (p.player_profiles as unknown) as SquadEntry['player']
            };
        });
        
        const count = squad.length;
        const min = settings?.min_squad_size ?? 0;
        const max = settings?.max_squad_size ?? 99;
        
        const startingPurse = Number(settings?.auction_starting_purse ?? wallet?.starting_balance ?? defaultPurse);
        const squadSpent = squad.reduce((sum, p) => sum + Number(p.acquisition_amount || 0), 0);
        const totalSpent = Math.max(Number(wallet?.spent_amount || 0), squadSpent);
        const remaining = Math.max(0, startingPurse - totalSpent);

        let squadStatus = 'Valid squad';
        let statusColor = 'text-success bg-success/10 border-success/30';
        
        if (count < min) {
            squadStatus = 'Below minimum squad';
            statusColor = 'text-danger bg-danger/10 border-danger/30';
        } else if (count >= max) {
            squadStatus = 'Maximum squad reached';
            statusColor = 'text-primary bg-primary/10 border-primary/30';
        }

        return {
            ...t,
            wallet,
            startingPurse,
            totalSpent,
            remaining,
            squad,
            squadStatus,
            statusColor,
            count,
            max
        };
    });

    return (
        <div className="p-6 lg:p-10">
            <div className="mx-auto max-w-7xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-black tracking-tight text-text-primary flex items-center gap-3">
                        <ShieldCheckIcon className="w-8 h-8 text-primary" />
                        Teams & Squads
                    </h1>
                    <p className="mt-2 text-text-secondary">Authoritative view of all tournament teams and their assembled squads.</p>
                </div>

                <div className="space-y-8">
                    {teams.map(team => (
                        <div key={team.id} className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-border bg-surface-muted flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                                <div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <TeamRenameForm teamId={team.id} currentName={team.name} />
                                        <TeamColorsForm teamId={team.id} primaryColor={team.primary_color} secondaryColor={team.secondary_color} />
                                        <AssignPlayerButton
                                            tournamentId={id}
                                            teamId={team.id}
                                            teamName={team.name}
                                            currentSquadCount={team.count}
                                            maxSquadSize={team.max}
                                            eligiblePlayers={eligiblePlayers}
                                            remainingWalletBalance={team.remaining}
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-sm font-semibold text-text-secondary">{team.count} / {team.max} players</span>
                                        <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${team.statusColor}`}>
                                            {team.squadStatus}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-6 text-right">
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Total Spent</p>
                                        <p className="font-mono text-sm font-bold text-text-primary">₹{team.totalSpent.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Remaining</p>
                                        <p className="font-mono text-lg font-bold text-primary">₹{team.remaining.toLocaleString('en-IN')}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6">
                                <OrganizerTeamsSquadRoster squad={team.squad} teamName={team.name} tournamentId={id} />
                            </div>
                        </div>
                    ))}
                    {teams.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-text-secondary">
                            No teams have been created for this tournament yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
