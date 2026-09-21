/**
 * Public route group layout.
 *
 * Wraps all public/spectator pages: tournament home, live, fixtures,
 * results, standings, bracket, teams, players.
 *
 * No auth required. No organizer navigation.
 * Public pages prefer server rendering for SEO and shareability.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
