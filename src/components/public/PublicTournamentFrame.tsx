'use client';

/**
 * PublicTournamentFrame — shared chrome for all public tournament sub-pages.
 *
 * Renders:
 *  - Sticky header with tournament name/logo
 *  - Tab navigation: Live · Fixtures · Results · Table · Teams · Players
 *  - Active tab detection via pathname
 *  - Mobile-first, 320px+
 *  - Dark purple/indigo design system
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Radio } from 'lucide-react';

const TABS = [
  { label: 'Live',     path: 'live',     icon: '🔴' },
  { label: 'Fixtures', path: 'fixtures', icon: null },
  { label: 'Results',  path: 'results',  icon: null },
  { label: 'Table',    path: 'table',    icon: null },
  { label: 'Teams',    path: 'teams',    icon: null },
  { label: 'Players',  path: 'players',  icon: null },
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

  const isLive = status === 'LIVE';

  return (
    <div className="min-h-screen" style={{ background: '#09090e', color: '#f0f0f4' }}>
      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          background: 'rgba(14,13,21,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {/* Top row: brand + live badge */}
          <div className="flex items-center justify-between gap-4 py-3">
            <Link
              href={`/t/${slug}`}
              className="flex min-w-0 items-center gap-3 group"
            >
              {logoUrl ? (
                <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg"
                  style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
                  <Image
                    src={logoUrl}
                    alt={`${name} logo`}
                    fill
                    sizes="32px"
                    className="object-contain p-1"
                    unoptimized
                  />
                </div>
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                  style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}
                >
                  {name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="truncate text-sm font-bold text-white/90 group-hover:text-white transition-colors">
                {name}
              </span>
            </Link>

            {isLive && (
              <span
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <Radio className="h-3 w-3 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          {/* Tab navigation */}
          <nav
            aria-label="Tournament navigation"
            className="flex gap-0.5 overflow-x-auto pb-0"
            style={{ scrollbarWidth: 'none' }}
          >
            {TABS.map(({ label, path }) => {
              const href = `/t/${slug}/${path}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={path}
                  href={href}
                  className="relative shrink-0 px-3 py-2.5 text-sm font-semibold transition-colors"
                  style={{
                    color: isActive ? '#a5b4fc' : 'rgba(255,255,255,0.45)',
                  }}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                      style={{ background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </main>
    </div>
  );
}