'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { downloadCsv } from '@/lib/csv';
import { jerseySheet, type JerseyRow } from '@/lib/jersey-sheet';

/** Downloads the jersey sheet (number, name on the jersey and size, then how many of each size) for the given players as a CSV file. */
export function JerseyExportButton({ rows, fileName, label }: { rows: JerseyRow[]; fileName: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(fileName, jerseySheet(rows))}
      disabled={rows.length === 0}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
