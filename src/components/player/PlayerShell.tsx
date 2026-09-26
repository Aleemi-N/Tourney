'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, Home, UserRound } from 'lucide-react';

const links = [
  { href: '/player', label: 'My tournaments', icon: CalendarDays, exact: true },
  { href: '/player/profile', label: 'Profile', icon: UserRound, exact: false },
];

export function PlayerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-[#100d1c] text-white">
      <header className="border-b border-white/10 bg-[#17132a]">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/player" className="rounded-lg py-2 text-lg font-semibold tracking-tight focus-visible:outline-offset-4">Tourny <span className="text-fuchsia-300">Player</span></Link>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white/65 hover:bg-white/5 hover:text-white">
            <Home className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Tourny home</span>
          </Link>
        </div>
        <nav aria-label="Player navigation" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-8">
          {links.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold ${active ? 'border-fuchsia-300 text-fuchsia-200' : 'border-transparent text-white/55 hover:text-white'}`}><item.icon className="h-4 w-4" aria-hidden="true" />{item.label}</Link>;
          })}
        </nav>
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
