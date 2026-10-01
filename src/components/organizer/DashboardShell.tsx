'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { 
  HomeIcon, 
  TrophyIcon, 
  UsersIcon,
  UserGroupIcon,
  Squares2X2Icon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  CalendarIcon,
  ChartBarIcon,
  Bars3Icon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { VolleyballIcon } from '../landing/VolleyballIcon';
import { OrganizerLinkPending } from './OrganizerLinkPending';

const globalNavigation = [
  { name: 'Dashboard', href: '/organizer/dashboard', icon: HomeIcon, disabled: false },
  { name: 'Tournaments', href: '/organizer/tournaments', icon: TrophyIcon, disabled: false },
];

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
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  useEffect(() => {
    setIsMoreMenuOpen(false);
  }, [pathname]);

  // Extract tournament ID from the pathname if it exists
  const match = pathname.match(/\/organizer\/tournaments\/([^/]+)/);
  const tournamentId = match ? match[1] : null;
  const isTournamentContext = tournamentId && tournamentId !== 'new';

  const tournamentNavigation = isTournamentContext ? [
    { name: 'Overview', href: `/organizer/tournaments/${tournamentId}`, icon: TrophyIcon },
    { name: 'Participants', href: `/organizer/tournaments/${tournamentId}/participants`, icon: UsersIcon },
    { name: 'Staff', href: `/organizer/tournaments/${tournamentId}/staff`, icon: UserGroupIcon, disabled: false },
    ...(lotEnabledTournamentIds.includes(tournamentId) ? [{ name: 'Lot Draw', href: `/organizer/tournaments/${tournamentId}/lot`, icon: Squares2X2Icon, disabled: false }] : []),
    { name: 'Auction', href: `/organizer/tournaments/${tournamentId}/auction`, icon: BanknotesIcon, disabled: false },
    { name: 'Teams & Squads', href: `/organizer/tournaments/${tournamentId}/teams`, icon: ShieldCheckIcon, disabled: false },
    { name: 'Fixtures', href: `/organizer/tournaments/${tournamentId}/fixtures`, icon: CalendarIcon, disabled: false },
    { name: 'Standings', href: `/organizer/tournaments/${tournamentId}/standings`, icon: ChartBarIcon, disabled: false },
    { name: 'Settings', href: `/organizer/tournaments/${tournamentId}/settings`, icon: Cog6ToothIcon, disabled: false },
  ] : [];

  const navigation = [...globalNavigation, ...tournamentNavigation];
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'OR';

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-surface/80 backdrop-blur-xl border-r border-glass-border h-screen sticky top-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="flex flex-col shrink-0 px-4 py-4 gap-4">
          <Link href="/" className="flex items-center gap-2 group px-2">
            <VolleyballIcon className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
            <span className="font-bold text-lg text-text-primary tracking-tight">Tourny</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 px-2 py-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors bg-surface-muted rounded-md group">
            <ArrowLeftIcon className="w-4 h-4 text-text-muted group-hover:text-text-secondary transition-colors" />
            Back to Tourny
          </Link>
        </div>
        
        <nav className="flex flex-1 flex-col px-4 py-2 overflow-y-auto">
          <ul role="list" className="flex flex-1 flex-col gap-y-2">
            <li>
              <ul role="list" className="space-y-1">
                {navigation.map((item) => {
                  const isActive = !item.disabled && pathname === item.href;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.disabled ? '#' : item.href}
                        prefetch={item.disabled ? false : undefined}
                        aria-disabled={item.disabled ? true : undefined}
                        tabIndex={item.disabled ? -1 : undefined}
                        aria-current={isActive ? 'page' : undefined}
                        className={`
                          group flex gap-x-3 rounded-xl p-2.5 text-sm leading-6 font-medium transition-all duration-300
                          ${item.disabled 
                            ? 'text-text-muted cursor-not-allowed opacity-50 pointer-events-none' 
                            : isActive 
                              ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-[inset_3px_0_0_var(--color-primary)]' 
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted/50 hover:translate-x-1'}
                        `}
                        onClick={(e) => {
                          if (item.disabled) e.preventDefault();
                        }}
                      >
                        <item.icon
                          className={`h-6 w-6 shrink-0 ${item.disabled ? 'text-text-muted' : isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary'}`}
                          aria-hidden="true"
                        />
                        {item.name}
                        {!item.disabled && <OrganizerLinkPending className="ml-auto" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          </ul>
        </nav>

        {/* Desktop Account Footer */}
        <div className="shrink-0 p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-text-primary truncate">{user?.full_name || 'Organizer'}</span>
              <span className="text-xs text-text-muted truncate">{user?.email || ''}</span>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="group flex w-full gap-x-3 rounded-md p-2 text-sm leading-6 font-medium text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <ArrowRightOnRectangleIcon
                className="h-5 w-5 shrink-0 text-text-muted group-hover:text-danger"
                aria-hidden="true"
              />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="app-shell-content flex-1 overflow-y-auto">
        {children}
      </main>

            {/* Mobile Bottom Navigation */}
      <nav aria-label="Organizer mobile navigation" className="mobile-safe-nav md:hidden fixed bottom-0 left-0 right-0 z-[100] bg-surface/90 backdrop-blur-xl border-t border-glass-border px-1 flex justify-between items-center shadow-[0_-8px_30px_rgba(0,0,0,0.08)]">
        {(isTournamentContext 
          ? [globalNavigation[0], tournamentNavigation[0], tournamentNavigation[1]]
          : [{ name: 'Home', href: '/', icon: VolleyballIcon, disabled: false }, globalNavigation[0], globalNavigation[1]]
        ).map((item) => {
          const isActive = !item.disabled && pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.disabled ? '#' : item.href}
              prefetch={item.disabled ? false : undefined}
              aria-disabled={item.disabled ? true : undefined}
              tabIndex={item.disabled ? -1 : undefined}
              onClick={(e) => {
                if (item.disabled) e.preventDefault();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 p-3 w-[25%] transition-all duration-300 ${
                item.disabled
                  ? 'text-text-muted cursor-not-allowed opacity-50 pointer-events-none'
                  : isActive
                  ? 'text-primary -translate-y-1'
                  : 'text-text-secondary active:scale-95'
              }`}
            >
              <item.icon className="h-6 w-6" />
              <span className="flex items-center gap-1 text-xs font-semibold truncate max-w-[100%]">
                {item.name.replace(' (Coming Soon)', '')}
                {!item.disabled && <OrganizerLinkPending className="h-2.5 w-2.5 flex-shrink-0" />}
              </span>
            </Link>
          );
        })}
        
        <button
          type="button"
          onClick={() => setIsMoreMenuOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 p-3 w-[25%] transition-all duration-300 ${
            navigation.slice(isTournamentContext ? 3 : 2).some(item => pathname === item.href) ? 'text-primary -translate-y-1' : 'text-text-secondary active:scale-95'
          }`}
        >
          <Bars3Icon className="h-6 w-6" />
          <span className="text-xs font-semibold">More</span>
        </button>
      </nav>

      {/* Mobile More Menu Drawer */}
      {isMoreMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full rounded-t-2xl shadow-xl border-t border-border animate-in slide-in-from-bottom-full duration-200">
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Menu</h2>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(false)}
                className="p-2 text-text-secondary hover:text-text-primary rounded-full bg-surface-muted"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 flex flex-col gap-2 pb-8">
              {navigation.slice(3).map((item) => {
                const isActive = !item.disabled && pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.disabled ? '#' : item.href}
                    prefetch={item.disabled ? false : undefined}
                    aria-disabled={item.disabled ? true : undefined}
                    tabIndex={item.disabled ? -1 : undefined}
                    onClick={(e) => {
                      if (item.disabled) e.preventDefault();
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-3 p-3 rounded-xl ${
                      item.disabled
                        ? 'text-text-muted cursor-not-allowed opacity-50 pointer-events-none'
                        : isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-text-secondary hover:bg-surface-muted'
                    }`}
                  >
                    <item.icon className="h-6 w-6" />
                    <span>{item.name}</span>
                    {!item.disabled && <OrganizerLinkPending className="ml-auto h-4 w-4" />}
                  </Link>
                );
              })}
              
              <div className="h-px bg-border my-2" />
              
              <div className="flex items-center gap-3 p-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-text-primary truncate">{user?.full_name || 'Organizer'}</span>
                  <span className="text-xs text-text-muted truncate">{user?.email || ''}</span>
                </div>
              </div>
              
              <form action={logout} className="w-full">
                <button
                  type="submit"
                  className="flex items-center w-full gap-3 p-3 rounded-xl text-text-secondary hover:bg-danger/10 hover:text-danger font-medium transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="h-6 w-6" />
                  <span>Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}