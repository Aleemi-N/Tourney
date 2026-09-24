import Link from 'next/link';

export function ScorerShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#100d1c] text-white">
      <header className="border-b border-white/10 bg-[#17132a] px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/scorer" className="text-lg font-semibold tracking-tight">Tourny <span className="text-fuchsia-300">Scorer</span></Link>
          <span className="rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-100">Live volleyball</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:py-12">{children}</main>
    </div>
  );
}