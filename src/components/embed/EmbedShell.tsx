'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads the server data every few seconds so an embedded table or score stays current. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

/** Bare page chrome for widgets placed on other websites: a title, the content, and a link back to Tourny. */
export function EmbedShell({ theme, title, subtitle, href, children, refreshSeconds }: { theme?: string; title: string; subtitle?: string; href: string; children: ReactNode; refreshSeconds: number }) {
  return (
    <div data-theme={theme === 'dark' || theme === 'light' ? theme : undefined} className="min-h-screen bg-background p-3 text-text-primary">
      <AutoRefresh seconds={refreshSeconds} />
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
      <p className="mt-3 text-right text-[12px] text-text-muted">
        <a href={href} target="_blank" rel="noopener" className="font-semibold text-primary hover:underline">Powered by Tourny</a>
      </p>
    </div>
  );
}
