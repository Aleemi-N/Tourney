import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { OwnerTeam } from '@/lib/owner/owner-team';
import { teamColorStyle } from '@/lib/utils';

export function OwnerTeamHeader({ team }: { team: OwnerTeam }) {
    return (
        <header className="border-b border-border bg-surface px-4 py-6 sm:px-8 lg:px-12">
            <div className="mx-auto max-w-6xl">
                <Link href="/owner/dashboard" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    All teams
                </Link>
                <div className="mt-2 flex min-w-0 items-center gap-4">
                    <span
                        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary"
                        style={teamColorStyle(team.primary_color)}
                    >
                        {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-text-secondary">{team.tournament_name}</p>
                        <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">{team.name}</h1>
                    </div>
                </div>
            </div>
        </header>
    );
}
