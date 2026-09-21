/**
 * Player route group layout.
 *
 * Wraps all player portal pages.
 * Requires authenticated Player role.
 * Significantly simpler than Organizer — profile-centric experience.
 * Placeholder shell — navigation to be built in the player phase.
 */
export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
