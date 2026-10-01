import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { OwnerTeamHeader } from '@/components/owner/OwnerTeamHeader';
import { UserIcon } from '@heroicons/react/24/solid';

export const metadata: Metadata = { title: 'Player Pool | Team Owner' };

type PlayerRow = {
    id: string;
    player_id: string;
    player_profiles: {
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
        place: string | null;
        height_cm: number | null;
    } | null;
};

export default async function OwnerPlayerPoolPage({ params }: { params: Promise<{ teamId: string }> }) {
    const { teamId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const teams = await getOwnerTeams(supabase, user.id);
    const team = teams.find((item) => item.id === teamId);
    if (!team) notFound();

    const { data: registrationsData } = await supabase
        .from('player_tournament_registrations')
        .select('id, player_id, player_profiles(display_name, photo_path, primary_position, secondary_position, place, height_cm)')
        .eq('tournament_id', team.tournament_id)
        .eq('status', 'APPROVED');

    const rawPlayers = (registrationsData ?? []) as unknown as PlayerRow[];

    const players = rawPlayers.map((row) => {
        return {
            id: row.id,
            playerId: row.player_id,
            player: row.player_profiles,
        };
    }).sort((a, b) => (a.player?.display_name || '').localeCompare(b.player?.display_name || ''));

    const playerCount = players.length;

    return (
        <OwnerPortalShell teams={teams} activeTeamId={team.id}>
            <OwnerTeamHeader team={team} />
            <div className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
                <div className="mx-auto max-w-6xl">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300/80">Tournament Players</p>
                            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">Player Pool</h1>
                            <p className="mt-1 text-sm text-white/55">All registered and approved players available for {team.tournament_name}.</p>
                        </div>
                    </div>

                    {/* Player List */}
                    <section className="mt-8">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                Available Players
                                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/70">
                                    {playerCount}
                                </span>
                            </h2>
                        </div>

                        {players.length === 0 ? (
                            <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/3 p-12 text-center text-sm text-white/55">
                                No players are available in this tournament yet.
                            </div>
                        ) : (
                            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {players.map((item) => {
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
