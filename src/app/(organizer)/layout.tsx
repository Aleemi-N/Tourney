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
import { createClient, getUser } from '@/lib/api/server';
import { isLotDrawEnabled } from '@/lib/lot-draw';
import { redirect } from 'next/navigation';

export default async function OrganizerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: { user } } = await getUser();

  if (!user) {
    redirect('/login?next=/organizer/dashboard');
  }

  const profile = {
    full_name: user.user_metadata?.full_name || 'Organizer',
    email: user.email,
  };

  const api = await createClient();
  const { data: tournaments } = await api
    .from('tournaments')
    .select('id, format, league_mode, tournament_settings(icon_selection_method, setter_selection_method)');
  const lotEnabledTournamentIds = (tournaments ?? []).filter((tournament) => {
    const raw = tournament.tournament_settings;
    const settings = Array.isArray(raw) ? raw[0] : raw;
    return isLotDrawEnabled(tournament.format, tournament.league_mode, settings?.icon_selection_method, settings?.setter_selection_method);
  }).map((tournament) => tournament.id);

  return <DashboardShell user={profile} lotEnabledTournamentIds={lotEnabledTournamentIds}>{children}</DashboardShell>;
}
