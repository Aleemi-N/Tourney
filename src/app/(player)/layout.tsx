import { PlayerShell } from '@/components/player/PlayerShell';

/**
 * Player route group layout.
 *
 * Wraps all player portal pages.
 * Requires authenticated Player role.
 * Significantly simpler than Organizer — profile-centric experience.
 * Uses a deliberately simple, role-specific shell.
 */
export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PlayerShell>{children}</PlayerShell>;
}
