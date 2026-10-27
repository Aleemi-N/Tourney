'use client';

/**
 * PublicTournamentFrame — shared chrome for all public tournament sub-pages:
 * sticky header with the tournament name/logo and tab navigation
 * (Live · Fixtures · Results · Table · Teams · Players). Mobile-first, 320px+.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { StatusPill } from '@/components/ui/StatusPill';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { cn } from '@/lib/utils';
import { WebFollowButton } from './WebFollowButton';

const TABS = [
  { label: 'Live', path: 'live' },
  { label: 'Fixtures', path: 'fixtures' },
  { label: 'Results', path: 'results' },
  { label: 'Table', path: 'table' },
  { label: 'Teams', path: 'teams' },
  { label: 'Players', path: 'players' },
] as const;

interface Props {
  slug: string;
  name: string;
  logoUrl?: string | null;
  status?: string | null;
  children: React.ReactNode;
}

export function PublicTournamentFrame({ slug, name, logoUrl, status, children }: Props) {
  const pathname = usePathname();
  // Pages of one match or one team also offer to follow just that.
  const matchId = /^\/t\/[^/]+\/match\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1];
  const teamId = /^\/t\/[^/]+\/teams\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1];

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 py-2">
            <Link href={`/t/${slug}`} className="flex min-h-11 min-w-0 items-center gap-3">
              {logoUrl ? (
                <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
                  <Image src={logoUrl} alt="" fill sizes="32px" className="object-contain p-1" unoptimized />
                </span>
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary" aria-hidden="true">
                  {name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="truncate text-sm font-semibold text-text-primary">{name}</span>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              {status === 'LIVE' ? <StatusPill status="LIVE" /> : null}
              {matchId ? <WebFollowButton kind="MATCH" targetId={matchId} label="this match" /> : null}
              {teamId ? <WebFollowButton kind="TEAM" targetId={teamId} label="this team" /> : null}
              <WebFollowButton kind="TOURNAMENT" slug={slug} label={name} />
              <ThemeToggle />
            </div>
          </div>

          <nav aria-label="Tournament navigation" className="-mb-px flex overflow-x-auto [scrollbar-width:none]">
            {TABS.map(({ label, path }) => {
              const href = `/t/${slug}/${path}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={path}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold transition-colors',
                    isActive ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">{children}</main>
    </div>
  );
}
