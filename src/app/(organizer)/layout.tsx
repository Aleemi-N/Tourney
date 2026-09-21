/**
 * Organizer route group layout.
 *
 * Wraps all organizer management pages.
 * Requires authenticated Organizer role — role check to be enforced
 * via middleware + RLS in the auth phase.
 *
 * Desktop: persistent sidebar + top bar.
 * Mobile: bottom navigation with More sheet.
 * Placeholder shell — navigation to be built in the organizer phase.
 */
import { DashboardShell } from '@/components/organizer/DashboardShell';
import { createClient, getUser } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  console.time('Organizer layout auth');
  const { data: { user } } = await getUser();
  console.timeEnd('Organizer layout auth');

  if (!user) {
    redirect('/login?next=/organizer/dashboard');
  }

  const profile = {
    full_name: user.user_metadata?.full_name || 'Organizer',
    email: user.email,
  };

  return <DashboardShell user={profile}>{children}</DashboardShell>;
}
