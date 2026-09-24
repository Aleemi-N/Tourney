import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

import { ShieldCheckIcon } from '@heroicons/react/24/outline';

export const metadata: Metadata = {
    title: 'Teams & Squads | Organizer',
};

type SquadEntry = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
    player: {
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
    } | null;
};

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
        { data: salesData }
    ] = await Promise.all([
        supabase.from('tournaments').select('id, name, status').eq('id', id).single(),
        supabase.from('tournament_settings').select('min_squad_size, max_squad_size').eq('tournament_id', id).single(),
        supabase.from('teams').select('id, name, short_name, logo_path, status').eq('tournament_id', id).order('name'),
        auction ? supabase.from('auction_team_wallets').select('team_id, starting_balance, spent_amount, remaining_balance').eq('auction_id', auction.id) : Promise.resolve({ data: [] }),
        supabase.from('team_players').select('id, team_id, player_id, acquisition_type, acquisition_amount, player_profiles(display_name, photo_path, primary_position, secondary_position)').eq('tournament_id', id).eq('status', 'ACTIVE'),
        auction ? supabase.from('auction_sales').select('team_id, auction_players!inner(player_id, attempt_number)') : Promise.resolve({ data: [] })
    ]);

    if (!tournament) notFound();

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
        
        let squadStatus = 'Valid squad';
        let statusColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
        
        if (count < min) {
            squadStatus = 'Below minimum squad';
            statusColor = 'text-rose-400 bg-rose-400/10 border-rose-400/30';
        } else if (count >= max) {
            squadStatus = 'Maximum squad reached';
            statusColor = 'text-fuchsia-300 bg-fuchsia-300/10 border-fuchsia-300/30';
        }

        return {
            ...t,
            wallet,
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
                        <ShieldCheckIcon className="w-8 h-8 text-fuchsia-400" />
                        Teams & Squads
                    </h1>
                    <p className="mt-2 text-text-secondary">Authoritative view of all tournament teams and their assembled squads.</p>
                </div>

                <div className="space-y-8">
                    {teams.map(team => (
                        <div key={team.id} className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-border bg-surface-muted/30 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-text-primary">{team.name}</h2>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-sm font-semibold text-text-secondary">{team.count} / {team.max} players</span>
                                        <span className={`px-2.5 py-0.5 rounded-full border text-xs font-bold uppercase tracking-wider ${team.statusColor}`}>
                                            {team.squadStatus}
                                        </span>
                                    </div>
                                </div>
                                {team.wallet && (
                                    <div className="flex gap-6 text-right">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Total Spent</p>
                                            <p className="font-mono text-sm font-bold text-text-primary">₹{Number(team.wallet.spent_amount).toLocaleString('en-IN')}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Remaining</p>
                                            <p className="font-mono text-lg font-bold text-fuchsia-400">₹{Number(team.wallet.remaining_balance).toLocaleString('en-IN')}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="p-6">
                                {team.squad.length === 0 ? (
                                    <div className="py-8 text-center border border-dashed border-border rounded-xl">
                                        <p className="text-sm text-text-muted">No players assigned yet.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                        {team.squad.map(p => (
                                            <article key={p.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background p-4">
                                                <div className="min-w-0">
                                                    <h3 className="truncate font-bold text-text-primary text-sm">{p.player?.display_name ?? 'Player'}</h3>
                                                    <p className="truncate text-xs text-text-secondary">{p.player?.primary_position ?? 'Position pending'}</p>
                                                </div>
                                                <div className="flex items-end justify-between border-t border-border pt-3 mt-auto">
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-400/80">{p.acquisition_type.replaceAll('_', ' ')}</p>
                                                    <p className="font-mono text-xs font-bold text-text-primary">
                                                        {p.acquisition_amount !== null ? `₹${Number(p.acquisition_amount).toLocaleString('en-IN')}` : '—'}
                                                    </p>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
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
