'use client';

/**
 * TournamentFilters — client-side filter controls for the tournament management list.
 * URL-based state (search params) for sharable links and refresh stability.
 */

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_APPROVAL', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

export function TournamentFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get('status') ?? 'ALL';
  const currentSearch = searchParams.get('q') ?? '';

  const setParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'ALL') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          id="tournament-search"
          type="text"
          placeholder="Search tournaments…"
          defaultValue={currentSearch}
          onChange={(e) => {
            const val = e.target.value;
            // Debounce slightly
            const timer = setTimeout(() => setParam('q', val), 300);
            return () => clearTimeout(timer);
          }}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            id={`filter-${f.value.toLowerCase()}`}
            onClick={() => setParam('status', f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all
              ${currentStatus === f.value
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                : 'bg-surface-muted text-text-secondary hover:bg-border hover:text-text-primary border border-border'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
