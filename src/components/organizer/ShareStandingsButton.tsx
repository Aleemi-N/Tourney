'use client';

import { shareStandingsPoster } from '@/lib/share-posters';

type Args = Parameters<typeof shareStandingsPoster>;

export function ShareStandingsButton({ tournament, stage, rows }: { tournament: Args[0]; stage: Args[1]; rows: Args[2] }) {
  return (
    <button
      onClick={() => void shareStandingsPoster(tournament, stage, rows)}
      className="min-h-11 rounded-lg border border-primary/40 px-4 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
    >
      📋 Share Points Table
    </button>
  );
}
