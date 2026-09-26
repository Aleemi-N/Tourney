'use client';

/**
 * SuperAdminShell — Platform-level admin navigation shell.
 *
 * Deliberately separate from the organizer DashboardShell to prevent
 * any UI-level role confusion. Super Admin is a platform role, not a
 * tournament-level role.
 *
 * Dark + purple visual system consistent with Tourny design tokens.
 * Responsive: 320 / 390 / 768 / 1024 / 1440+
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/actions/auth';
import {
  HomeIcon,
  ClipboardDocumentCheckIcon,
  TrophyIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon } from '@heroicons/react/24/solid';

interface SuperAdminShellProps {
  children: React.ReactNode;
  user?: {
    full_name: string;
    email?: string;
  };
  pendingApprovals?: number;
}

const navigation = [
  { name: 'Dashboard',    href: '/super-admin',              icon: HomeIcon,                        exact: true },
  { name: 'Approvals',    href: '/super-admin/approvals',    icon: ClipboardDocumentCheckIcon,      exact: false, badge: true },
  { name: 'Tournaments',  href: '/super-admin/tournaments',  icon: TrophyIcon,                      exact: false },
  { name: 'Organizers',   href: '/super-admin/organizers',   icon: UsersIcon,                       exact: false },
  { name: 'Audit Log',    href: '/super-admin/audit',        icon: ClipboardDocumentListIcon,       exact: false },
];

export function SuperAdminShell({ children, user, pendingApprovals = 0 }: SuperAdminShellProps) {
  const pathname = usePathname();
  const initials = user?.full_name ? user.full_name.substring(0, 2).toUpperCase() : 'SA';

  const isActive = (item: typeof navigation[0]) => {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-surface border-r border-border h-screen sticky top-0 shrink-0">
        {/* Logo + Identity */}
        <div className="flex flex-col shrink-0 px-4 py-5 gap-3 border-b border-border">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20 shrink-0">
              <ShieldCheckIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm text-text-primary tracking-tight">Tourny</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Super Admin</span>
              </div>
            </div>
          </div>

          {/* Platform warning badge */}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/20">
            <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] font-medium text-amber-300">Platform Admin Area</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col px-3 py-3 overflow-y-auto">
          <ul role="list" className="space-y-1">
            {navigation.map((item) => {
              const active = isActive(item);
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`
                      group flex items-center gap-x-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
                      ${active
                        ? 'bg-violet-600/15 text-violet-300 ring-1 ring-inset ring-violet-500/20'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-muted'}
                    `}
                  >
                    <item.icon
                      className={`h-5 w-5 shrink-0 transition-colors
                        ${active ? 'text-violet-400' : 'text-text-muted group-hover:text-text-secondary'}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1">{item.name}</span>
                    {item.badge && pendingApprovals > 0 && (
                      <span className="inline-flex items-center rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold text-white min-w-[18px] justify-center">
                        {pendingApprovals > 99 ? '99+' : pendingApprovals}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Account Footer */}
        <div className="shrink-0 p-4 border-t border-border">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-violet-600/20 text-violet-300 flex items-center justify-center font-bold text-sm shrink-0 ring-1 ring-violet-500/30">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-text-primary truncate">{user?.full_name || 'Super Admin'}</span>
              <span className="text-xs text-text-muted truncate">{user?.email || ''}</span>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="group flex w-full gap-x-3 rounded-md px-3 py-2 text-sm font-medium text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0 text-text-muted group-hover:text-danger" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <main className="app-shell-content flex-1 overflow-y-auto min-w-0">
        {children}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav aria-label="Super admin mobile navigation" className="mobile-safe-nav md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border px-1 flex justify-around items-start shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        {navigation.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg min-w-[52px] transition-colors
                ${active ? 'text-violet-400' : 'text-text-muted'}`}
            >
              <div className="relative">
                <item.icon className="h-5 w-5" />
                {item.badge && pendingApprovals > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex items-center rounded-full bg-violet-600 text-[9px] font-bold text-white w-3.5 h-3.5 justify-center">
                    {pendingApprovals > 9 ? '9+' : pendingApprovals}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium truncate max-w-[54px] text-center leading-tight">
                {item.name}
              </span>
            </Link>
          );
        })}
        <form action={logout}>
          <button
            type="submit"
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg min-w-[52px] text-text-muted"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            <span className="text-[9px] font-medium">Out</span>
          </button>
        </form>
      </nav>
    </div>
  );
}
