import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Player Home' };

/** Player home placeholder — to be implemented in the player phase. */
export default function PlayerHomePage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text-primary">Player Home</h1>
      <p className="text-text-secondary">Player dashboard — coming soon.</p>
    </main>
  );
}
