'use client';

import Link from 'next/link';
import { CalendarDays, Gavel, LayoutDashboard, ListChecks, Trophy, Users } from 'lucide-react';
import { AppShell, type NavItem } from '@/components/ui/AppShell';
import type { OwnerTeam } from '@/lib/owner/owner-team';
import { cn } from '@/lib/utils';

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
  const base = activeTeam ? `/owner/teams/${activeTeam.id}` : null;

  const items: NavItem[] = base
    ? [
        { name: 'Overview', href: base, icon: LayoutDashboard },
        { name: 'Player pool', shortName: 'Players', href: `${base}/players`, icon: Users },
        { name: 'My squad', shortName: 'Squad', href: `${base}/squad`, icon: ListChecks },
        { name: 'Live auction', shortName: 'Auction', href: `${base}/auction`, icon: Gavel },
        { name: 'Fixtures', href: `${base}/fixtures`, icon: CalendarDays },
        { name: 'Results', href: `${base}/results`, icon: Trophy },
      ]
    : [{ name: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard }];

  const teamSwitcher =
    teams.length > 1 ? (
      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Your teams</p>
        <ul role="list" className="space-y-0.5">
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                href={`/owner/teams/${team.id}`}
                aria-current={team.id === activeTeam?.id ? 'true' : undefined}
                className={cn(
                  'block rounded-xl px-3 py-2 transition-colors',
                  team.id === activeTeam?.id ? 'bg-surface-muted' : 'hover:bg-surface-muted',
                )}
              >
                <span className="block truncate text-sm font-medium text-text-primary">{team.name}</span>
                <span className="block truncate text-xs text-text-muted">{team.tournament_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <AppShell
      portal="Team owner"
      homeHref="/owner/dashboard"
      sections={[{ label: activeTeam?.name, items }]}
      sidebarExtra={teamSwitcher}
    >
      {children}
    </AppShell>
  );
}
