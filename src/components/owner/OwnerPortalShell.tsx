import Link from 'next/link';
import { logout } from '@/app/actions/auth';
import type { OwnerTeam } from '@/lib/owner/owner-team';

export function OwnerPortalShell({
    teams,
    activeTeamId,
    children,
}: {
    teams: OwnerTeam[];
    activeTeamId?: string;
    children: React.ReactNode;
}) {
    const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];

    return (
        <div className="min-h-screen bg-[#100d1c] text-white">
            <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
                <aside className="border-b border-white/10 bg-[#17132a] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
                    <div className="flex items-center justify-between px-5 py-5 lg:px-7">
                        <Link href="/owner/dashboard" className="text-lg font-semibold tracking-tight text-white">
                            Tourny <span className="text-fuchsia-300">Owner</span>
                        </Link>
                        <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200">
                            Team portal
                        </span>
                    </div>

                    <nav aria-label="Owner navigation" className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-2 lg:px-4 lg:py-4">
                        <Link href="/owner/dashboard" className="block shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
                            Overview
                        </Link>
                        {activeTeam ? (
                            <>
                                <Link href={`/owner/teams/${activeTeam.id}`} className="block shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">
                                    My Squad
                                </Link>
                                <Link href={`/owner/teams/${activeTeam.id}/auction`} className="block shrink-0 rounded-xl bg-fuchsia-300 px-4 py-3 text-sm font-bold text-[#211334] shadow-[0_10px_30px_rgba(232,121,249,0.18)] transition hover:bg-fuchsia-200">
                                    Live Auction
                                </Link>
                            </>
                        ) : null}
                        {activeTeam ? <Link href={`/owner/teams/${activeTeam.id}/fixtures`} className="block shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white">Fixtures</Link> : <span className="block shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white/30">Fixtures</span>}
                        <span className="block shrink-0 rounded-xl px-4 py-3 text-sm font-semibold text-white/30">Results</span>
                    </nav>

                    {teams.length > 1 ? (
                        <div className="border-t border-white/10 px-4 py-3 lg:hidden">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Switch team</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${team.id === activeTeam?.id ? 'border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100' : 'border-white/10 text-white/60'}`}>
                                        {team.short_name || team.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {teams.length > 0 ? (
                        <div className="hidden border-t border-white/10 px-5 py-5 lg:block">
                            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Your teams</p>
                            <div className="space-y-2">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`block rounded-xl border px-3 py-3 transition ${team.id === activeTeam?.id ? 'border-fuchsia-300/40 bg-fuchsia-300/10' : 'border-white/10 hover:bg-white/5'}`}>
                                        <span className="block truncate text-sm font-semibold text-white">{team.name}</span>
                                        <span className="block truncate text-xs text-white/45">{team.tournament_name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <form action={logout} className="mt-auto hidden p-4 lg:block">
                        <button type="submit" className="w-full rounded-xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white/55 transition hover:border-rose-300/30 hover:bg-rose-300/10 hover:text-rose-100">
                            Sign out
                        </button>
                    </form>
                </aside>
                <main className="min-w-0 flex-1">{children}</main>
            </div>
        </div>
    );
}
