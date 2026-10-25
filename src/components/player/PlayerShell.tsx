'use client';

import Link from 'next/link';
import { CalendarDays, Home, UserRound } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';

const items = [
  { name: 'My tournaments', href: '/player', icon: CalendarDays },
  { name: 'My details', href: '/player/profile', icon: UserRound, prefix: true },
];

export function PlayerShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      layout="topbar"
      portal="Player"
      homeHref="/player"
      sections={[{ items }]}
      headerStart={
        <Link href="/" aria-label="Tourny home" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-muted hover:text-text-primary">
          <Home className="h-5 w-5" aria-hidden="true" />
        </Link>
      }
    >
      {children}
    </AppShell>
  );
}
