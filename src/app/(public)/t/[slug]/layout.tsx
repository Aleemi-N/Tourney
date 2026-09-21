/**
 * Public tournament page layout.
 * Tabs: LIVE | FIXTURES | RESULTS | TABLE | TEAMS | PLAYERS
 * Placeholder — to be implemented in the public pages phase.
 */
export default function TournamentPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Public tournament experiences intentionally use Tourny's dark token set.
  // Keeping the theme on the shared route layout also prevents a light frame
  // while navigating between the tournament page and registration pages.
  return <div className="dark min-h-screen bg-background text-text-primary">{children}</div>;
}
