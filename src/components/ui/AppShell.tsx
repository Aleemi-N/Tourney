'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';
import { logout } from '@/app/actions/auth';
import { VolleyballIcon } from '@/components/landing/VolleyballIcon';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

export type NavItem = {
  name: string;
  /** Label for the mobile bottom bar, where space is tight. */
  shortName?: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Match sub-paths too (default: exact path only). */
  prefix?: boolean;
  badge?: number;
};

export type NavSection = { label?: string; items: NavItem[] };

type ShellUser = { full_name: string; email?: string };

/**
 * One shell for every signed-in portal.
 *  - layout="sidebar": sidebar from md up, bottom bar + "More" sheet on phones
 *    (organizer, team owner, super admin).
 *  - layout="topbar": header with tabs (player, scorer), for small, focused portals.
 */
export function AppShell({
  portal,
  homeHref,
  sections,
  mobileItems,
  user,
  sidebarExtra,
  notice,
  layout = 'sidebar',
  headerStart,
  children,
}: {
  /** Shown beside the logo, e.g. "Organizer". */
  portal: string;
  homeHref: string;
  sections: NavSection[];
  /** Up to four items for the phone bottom bar; everything else lives under "More". */
  mobileItems?: NavItem[];
  user?: ShellUser;
  /** Extra sidebar content under the navigation, e.g. a team switcher. */
  sidebarExtra?: ReactNode;
  /** Banner above the page content, e.g. the platform-admin warning. */
  notice?: ReactNode;
  layout?: 'sidebar' | 'topbar';
  /** topbar only: content before the logo, e.g. a back link. */
  headerStart?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // The sheet belongs to the page it was opened on, so navigating closes it.
  const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
  const moreOpen = moreOpenOn === pathname;
  const allItems = sections.flatMap((section) => section.items);
  const isActive = (item: NavItem) => pathname === item.href || (!!item.prefix && pathname.startsWith(`${item.href}/`));

  const brand = (
    <Link href={homeHref} className="flex min-h-11 items-center gap-2 rounded-xl">
      <VolleyballIcon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="text-base font-bold tracking-tight text-text-primary">Tourny</span>
      <span className="text-sm font-medium text-text-muted">{portal}</span>
    </Link>
  );

  if (layout === 'topbar') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-surface">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-2 px-4 sm:px-8">
            {headerStart}
            <div className="min-w-0 flex-1">{brand}</div>
            <ThemeToggle />
            <SignOutButton compact />
          </div>
          {allItems.length > 1 ? (
            <nav aria-label={`${portal} navigation`} className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 sm:px-6">
              {allItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
                    isActive(item) ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
                  )}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.name}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>
        {notice}
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  const bottomItems = (mobileItems ?? allItems).slice(0, 4);
  const moreItems = allItems.filter((item) => !bottomItems.includes(item));
  const initials = (user?.full_name ?? portal).trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          {brand}
          <ThemeToggle />
        </div>
        <nav aria-label={`${portal} navigation`} className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
          {sections.map((section, index) => (
            <div key={section.label ?? index}>
              {section.label ? <p className="mb-1 truncate px-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{section.label}</p> : null}
              <ul role="list" className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={isActive(item)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {sidebarExtra}
        </nav>
        <div className="border-t border-border p-3">
          {user ? (
            <div className="mb-1 flex items-center gap-3 px-2 py-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden="true">{initials}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-text-primary">{user.full_name}</span>
                {user.email ? <span className="block truncate text-xs text-text-muted">{user.email}</span> : null}
              </span>
            </div>
          ) : null}
          <SignOutButton />
        </div>
      </aside>

      <main className="app-shell-content min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-1 md:hidden">
          {brand}
          <ThemeToggle />
        </div>
        {notice}
        {children}
      </main>

      <nav
        aria-label={`${portal} navigation`}
        className="mobile-safe-nav fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface md:hidden"
      >
        {bottomItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item) ? 'page' : undefined}
            className={cn(
              'relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium',
              isActive(item) ? 'text-primary' : 'text-text-secondary',
            )}
          >
            <span className="relative">
              <item.icon className="h-6 w-6" aria-hidden="true" />
              {item.badge ? <Badge count={item.badge} className="absolute -right-2 -top-1" /> : null}
            </span>
            <span className="max-w-full truncate">{item.shortName ?? item.name}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpenOn(pathname)}
          aria-haspopup="dialog"
          className={cn(
            'flex min-h-16 flex-1 flex-col items-center justify-center gap-1 px-1 text-xs font-medium',
            moreItems.some(isActive) ? 'text-primary' : 'text-text-secondary',
          )}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
          More
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpenOn(null)} title="Menu">
        <ul role="list" className="-mx-2 space-y-0.5">
          {moreItems.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item)} />
            </li>
          ))}
        </ul>
        {sidebarExtra ? <div className="-mx-2 mt-4">{sidebarExtra}</div> : null}
        <div className="-mx-2 mt-4 border-t border-border pt-4">
          {user ? (
            <p className="px-3 pb-2 text-sm text-text-secondary">
              Signed in as <span className="font-medium text-text-primary">{user.full_name}</span>
            </p>
          ) : null}
          <SignOutButton />
        </div>
      </Modal>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
      )}
    >
      <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {item.badge ? <Badge count={item.badge} /> : null}
      <OrganizerLinkPending />
    </Link>
  );
}

function Badge({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-5 text-primary-foreground', className)}>
      {count > 99 ? '99+' : count}
      <span className="sr-only"> pending</span>
    </span>
  );
}

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        aria-label={compact ? 'Sign out' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-xl text-sm font-medium text-text-secondary transition-colors hover:bg-danger/10 hover:text-danger',
          compact ? 'w-11 justify-center' : 'w-full px-3',
        )}
      >
        <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
        {compact ? null : 'Sign out'}
      </button>
    </form>
  );
}
