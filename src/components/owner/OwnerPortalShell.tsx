'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
    const pathname = usePathname();
    const activeTeam = teams.find((team) => team.id === activeTeamId) ?? teams[0];
    const navClass = (href: string, accent = false) => {
        const active = pathname === href;
        return `block min-h-11 shrink-0 rounded-xl border px-4 py-3 text-sm font-bold transition-all duration-300 ${active ? 'border-primary/40 bg-primary/20 text-white shadow-[0_0_15px_rgba(var(--primary),0.3)]' : `border-transparent ${accent ? 'text-primary drop-shadow-sm' : 'text-text-secondary'} hover:bg-surface-muted hover:text-text-primary`}`;
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans selection:bg-primary/30">
            <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
                <aside className="relative z-50 border-b border-white/10 bg-[#0a0a0a]/95 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
                    <div className="flex items-center justify-between px-6 py-6 lg:px-8">
                        <Link href="/owner/dashboard" className="text-xl font-semibold tracking-tight text-white">
                            Tourny <span className="text-neutral-500 font-medium">Owner</span>
                        </Link>
                    </div>

                    <nav aria-label="Owner navigation" className="flex gap-1 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:px-4 lg:py-2">
                        {activeTeam ? (
                            <>
                                <Link href={`/owner/teams/${activeTeam.id}`} aria-current={pathname === `/owner/teams/${activeTeam.id}` ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}`)}>
                                    Overview
                                </Link>
                                <Link href={`/owner/teams/${activeTeam.id}/squad`} aria-current={pathname.endsWith('/squad') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/squad`)}>
                                    My Squad
                                </Link>
                                <Link href={`/owner/teams/${activeTeam.id}/auction`} aria-current={pathname.endsWith('/auction') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/auction`, true)}>
                                    Live Auction
                                </Link>
                            </>
                        ) : (
                            <Link href="/owner/dashboard" className="block shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white">
                                Dashboard
                            </Link>
                        )}
                        {activeTeam ? <Link href={`/owner/teams/${activeTeam.id}/fixtures`} aria-current={pathname.endsWith('/fixtures') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/fixtures`)}>Fixtures</Link> : <span className="block shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600">Fixtures</span>}
                        {activeTeam ? <Link href={`/owner/teams/${activeTeam.id}/results`} aria-current={pathname.endsWith('/results') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/results`)}>Results</Link> : <span className="block shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-600">Results</span>}
                    </nav>

                    {teams.length > 1 ? (
                        <div className="border-t border-white/10 px-4 py-3 lg:hidden">
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 pl-2">Switch team</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${team.id === activeTeam?.id ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-white'}`}>
                                        {team.short_name || team.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {teams.length > 0 ? (
                        <div className="hidden border-t border-white/5 px-6 py-6 lg:block mt-2">
                            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Your teams</p>
                            <div className="space-y-1 -mx-2">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`block rounded-lg px-3 py-2 transition-colors ${team.id === activeTeam?.id ? 'bg-white/10' : 'hover:bg-white/[0.04]'}`}>
                                        <span className={`block truncate text-sm font-medium ${team.id === activeTeam?.id ? 'text-white' : 'text-neutral-300'}`}>{team.name}</span>
                                        <span className="block truncate text-xs font-medium text-neutral-500 mt-0.5">{team.tournament_name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <form action={logout} className="mt-auto hidden p-4 lg:block border-t border-white/5">
                        <button type="submit" className="w-full rounded-lg px-4 py-2.5 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/[0.04] hover:text-white">
                            Sign out
                        </button>
                    </form>
                </aside>
                <main className="min-w-0 flex-1 relative z-10">{children}</main>
            </div>
        </div>
    );
}
