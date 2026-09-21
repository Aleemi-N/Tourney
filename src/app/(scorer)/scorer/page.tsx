import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Assigned Matches' };

/** Scorer home placeholder — to be implemented in the scorer phase. */
export default function ScorerHomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text-primary">Assigned Matches</h1>
      <p className="text-text-secondary">Scorer dashboard — coming soon.</p>
    </main>
  );
}
