'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

// The theme lives on <html data-theme>, set before paint by the script in app/layout.tsx.
const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};
const getTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);

  function toggle() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('tourny-theme', next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    document.documentElement.dataset.theme = next;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Dark theme"
      aria-pressed={theme === null ? undefined : theme === 'dark'}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary',
        className,
      )}
    >
      <Moon className="h-5 w-5 dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-5 w-5 dark:block" aria-hidden="true" />
    </button>
  );
}
