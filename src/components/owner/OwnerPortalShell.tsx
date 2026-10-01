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
        <div className="min-h-screen bg-background text-text-primary">
            <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
                <aside className="relative z-50 border-b border-glass-border bg-surface-raised/80 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r shadow-lg">
                    <div className="flex items-center justify-between px-5 py-5 lg:px-7">
                        <Link href="/owner/dashboard" className="text-xl font-black tracking-tight text-white drop-shadow-sm">
                            Tourny <span className="text-primary">Owner</span>
                        </Link>
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-primary shadow-sm">
                            Team portal
                        </span>
                    </div>

                    <nav aria-label="Owner navigation" className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-2 lg:px-4 lg:py-4">
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
                            <Link href="/owner/dashboard" className="block shrink-0 rounded-xl px-4 py-3 text-sm font-bold text-text-secondary transition hover:bg-surface-muted hover:text-text-primary">
                                Dashboard
                            </Link>
                        )}
                        {activeTeam ? <Link href={`/owner/teams/${activeTeam.id}/fixtures`} aria-current={pathname.endsWith('/fixtures') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/fixtures`)}>Fixtures</Link> : <span className="block shrink-0 rounded-xl px-4 py-3 text-sm font-bold text-text-muted">Fixtures</span>}
                        {activeTeam ? <Link href={`/owner/teams/${activeTeam.id}/results`} aria-current={pathname.endsWith('/results') ? 'page' : undefined} className={navClass(`/owner/teams/${activeTeam.id}/results`)}>Results</Link> : <span className="block shrink-0 rounded-xl px-4 py-3 text-sm font-bold text-text-muted">Results</span>}
                    </nav>

                    {teams.length > 1 ? (
                        <div className="border-t border-glass-border px-4 py-3 lg:hidden">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Switch team</p>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${team.id === activeTeam?.id ? 'border-primary/40 bg-primary/20 text-white shadow-sm' : 'border-glass-border text-text-secondary hover:bg-surface-muted hover:text-text-primary'}`}>
                                        {team.short_name || team.name}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    {teams.length > 0 ? (
                        <div className="hidden border-t border-glass-border px-5 py-5 lg:block">
                            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-text-muted">Your teams</p>
                            <div className="space-y-2">
                                {teams.map((team) => (
                                    <Link key={team.id} href={`/owner/teams/${team.id}`} className={`block rounded-xl border px-3 py-3 transition-all ${team.id === activeTeam?.id ? 'border-primary/40 bg-primary/20 shadow-sm' : 'border-glass-border hover:bg-surface-muted'}`}>
                                        <span className="block truncate text-sm font-bold text-text-primary">{team.name}</span>
                                        <span className="block truncate text-xs font-semibold text-text-secondary">{team.tournament_name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <form action={logout} className="mt-auto hidden p-4 lg:block">
                        <button type="submit" className="w-full rounded-xl border border-glass-border px-4 py-3 text-left text-sm font-bold text-text-secondary transition hover:border-danger/30 hover:bg-danger/10 hover:text-danger active:scale-95">
                            Sign out
                        </button>
                    </form>
                </aside>
                <main className="min-w-0 flex-1 relative z-10">{children}</main>
            </div>
        </div>
    );
}
