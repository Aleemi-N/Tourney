'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ListChecks } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';

export function ScorerShell({ children }: { children: React.ReactNode }) {
  const isMatch = usePathname().startsWith('/scorer/matches/');
  return (
    <AppShell
      layout="topbar"
      portal="Scorer"
      homeHref="/scorer"
      sections={[{ items: [{ name: 'Assigned matches', href: '/scorer', icon: ListChecks }] }]}
      headerStart={
        isMatch ? (
          <Link href="/scorer" aria-label="Back to assigned matches" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary hover:bg-surface-muted hover:text-text-primary">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-8 sm:py-8">{children}</main>
    </AppShell>
  );
}
