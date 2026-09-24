import Link from 'next/link';
import type { OwnerTeam } from '@/lib/owner/owner-team';

export function OwnerTeamHeader({ team }: { team: OwnerTeam }) {
    return (
        <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,_rgba(232,121,249,0.16),_transparent_35%),#100d1c] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
            <div className="mx-auto max-w-6xl">
                <Link href="/owner/dashboard" className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">All teams</Link>
                <div className="mt-6 flex min-w-0 items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-fuchsia-200/20 bg-fuchsia-300/10 text-lg font-black text-fuchsia-100">
                        {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fuchsia-200">{team.tournament_name}</p>
                        <h1 className="mt-1 truncate text-3xl font-black tracking-tight text-white sm:text-4xl">{team.name}</h1>
                    </div>
                </div>
            </div>
        </header>
    );
}