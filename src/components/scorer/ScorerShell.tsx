'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ListChecks } from 'lucide-react';

export function ScorerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMatch = pathname.startsWith('/scorer/matches/');
  return (
    <div className="min-h-screen bg-[#100d1c] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#17132a]/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex min-h-11 max-w-6xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            {isMatch ? <Link href="/scorer" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 text-sm font-bold text-white/70 hover:bg-white/5 hover:text-white" aria-label="Back to assigned matches"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Assigned matches</span></Link> : null}
            <Link href="/scorer" className="truncate py-2 text-lg font-semibold tracking-tight">Tourny <span className="text-fuchsia-300">Scorer</span></Link>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-fuchsia-100"><ListChecks className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden min-[360px]:inline">Match control</span></span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8 lg:py-10">{children}</main>
    </div>
  );
}
