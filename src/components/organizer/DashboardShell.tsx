'use client';

import { usePathname } from 'next/navigation';
import { BarChart3, CalendarDays, Gavel, LayoutDashboard, LayoutGrid, Settings, Shield, Trophy, UserCog, Users, Wallet } from 'lucide-react';
import { AppShell, type NavItem, type NavSection } from '@/components/ui/AppShell';

interface DashboardShellProps {
  children: React.ReactNode;
  user?: {
    full_name: string;
    email?: string;
  };
  lotEnabledTournamentIds?: string[];
}

export function DashboardShell({ children, user, lotEnabledTournamentIds = [] }: DashboardShellProps) {
  const pathname = usePathname();
  const tournamentId = pathname.match(/\/organizer\/tournaments\/([^/]+)/)?.[1];
  const inTournament = !!tournamentId && tournamentId !== 'new';

  const dashboard: NavItem = { name: 'Dashboard', shortName: 'Home', href: '/organizer/dashboard', icon: LayoutDashboard };
  const tournaments: NavItem = { name: 'Tournaments', href: '/organizer/tournaments', icon: Trophy };
  const sections: NavSection[] = [{ items: [dashboard, tournaments] }];

  let mobileItems = [dashboard, tournaments];
  if (inTournament) {
    const base = `/organizer/tournaments/${tournamentId}`;
    const overview: NavItem = { name: 'Overview', href: base, icon: Trophy };
    const players: NavItem = { name: 'Player details', shortName: 'Players', href: `${base}/participants`, icon: Users };
    const fixtures: NavItem = { name: 'Fixtures', href: `${base}/fixtures`, icon: CalendarDays };
    sections.push({
      label: 'This tournament',
      items: [
        overview,
        players,
        { name: 'Staff', href: `${base}/staff`, icon: UserCog },
        ...(lotEnabledTournamentIds.includes(tournamentId) ? [{ name: 'Lot draw', href: `${base}/lot`, icon: LayoutGrid }] : []),
        { name: 'Auction', href: `${base}/auction`, icon: Gavel },
        { name: 'Teams & squads', shortName: 'Teams', href: `${base}/teams`, icon: Shield },
        fixtures,
        { name: 'Standings', href: `${base}/standings`, icon: BarChart3 },
        { name: 'Payments', href: `${base}/payments`, icon: Wallet },
        { name: 'Settings', href: `${base}/settings`, icon: Settings },
      ],
    });
    mobileItems = [dashboard, overview, players, fixtures];
  }

  return (
    <AppShell portal="Organizer" homeHref="/organizer/dashboard" sections={sections} mobileItems={mobileItems} user={user}>
      {children}
    </AppShell>
  );
}
