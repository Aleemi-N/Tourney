import { getUser, getTournament, getTournamentMembership } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';

/**
 * Tournament Shared Layout
 * Provides tournament context and enforces organizer authorization
 * once for the entire tournament route group.
 */
export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    { data: { user } },
    { data: tournament },
  ] = await Promise.all([getUser(), getTournament(id)]);

  if (!user) {
    redirect('/login');
  }

  if (!tournament) {
    notFound();
  }

  const { data: membership } = await getTournamentMembership(id, user.id);
  
  if (membership?.role !== 'ORGANIZER') {
    notFound();
  }

  // Wrap in a subtle fade to ensure clean transitions
  // (Optional: can just return children since layout persists)
  return <>{children}</>;
}
