'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import { 
  HomeIcon, 
  TrophyIcon, 
  UsersIcon,
  VideoCameraIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftIcon
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
}

export function DashboardShell({ children, user }: DashboardShellProps) {
  const pathname = usePathname();

  // Extract tournament ID from the pathname if it exists
  const match = pathname.match(/\/organizer\/tournaments\/([^/]+)/);
  const tournamentId = match ? match[1] : null;
  const isTournamentContext = tournamentId && tournamentId !== 'new';

  const tournamentNavigation = isTournamentContext ? [
    { name: 'Overview', href: `/organizer/tournaments/${tournamentId}`, icon: TrophyIcon },
    { name: 'Participants', href: `/organizer/tournaments/${tournamentId}/participants`, icon: UsersIcon },
    { name: 'Live', href: '#', icon: VideoCameraIcon, disabled: true },
    { name: 'Settings', href: `/organizer/tournaments/${tournamentId}/settings`, icon: Cog6ToothIcon, disabled: false },
  ] : [];

  const navigation = [...globalNavigation, ...tournamentNavigation];
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'OR';

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-surface border-r border-border h-screen sticky top-0">
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
                        className={`
                          group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium
                          ${item.disabled 
                            ? 'text-text-muted cursor-not-allowed opacity-50 pointer-events-none' 
                            : isActive 
                              ? 'bg-primary/10 text-primary' 
                              : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted'}
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
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border px-2 pb-safe flex justify-between items-center h-16 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] overflow-x-auto">
        <Link
          href="/"
          className="flex flex-col items-center gap-1 p-2 text-text-secondary shrink-0"
        >
          <VolleyballIcon className="h-6 w-6" />
          <span className="text-[10px] font-medium">Home</span>
        </Link>
        
        {navigation.slice(0, 3).map((item) => {
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
              className={`flex flex-col items-center gap-1 p-2 shrink-0 ${
                item.disabled
                  ? 'text-text-muted cursor-not-allowed opacity-50 pointer-events-none'
                  : isActive
                  ? 'text-primary'
                  : 'text-text-secondary'
              }`}
            >
              <item.icon className="h-6 w-6" />
              <span className="flex items-center gap-1 text-[10px] font-medium truncate max-w-[72px] text-center">
                {item.name.replace(' (Coming Soon)', '')}
                {!item.disabled && <OrganizerLinkPending className="h-2.5 w-2.5" />}
              </span>
            </Link>
          );
        })}
        
        <form action={logout} className="shrink-0">
          <button
            type="submit"
            className="flex flex-col items-center gap-1 p-2 text-text-secondary"
          >
            <ArrowRightOnRectangleIcon className="h-6 w-6" />
            <span className="text-[10px] font-medium">Out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
