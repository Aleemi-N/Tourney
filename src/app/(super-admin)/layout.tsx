/**
 * Super Admin route group layout.
 *
 * Authorization:
 *   1. Session check — redirect to login if no session.
 *   2. Super Admin check — queries DB via RPC (is_platform_super_admin()).
 *      If not super admin, redirect to / with access denied.
 *
 * Authorization is NOT based on email alone or client-side state.
 * The RPC itself enforces the check at the DB level.
 */

import { redirect } from 'next/navigation';
import { createClient, getUser } from '@/lib/api/server';
import { SuperAdminShell } from '@/components/super-admin/SuperAdminShell';

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Session required
  const { data: { user } } = await getUser();

  if (!user) {
    redirect('/login?next=/super-admin');
  }

  // 2. Platform super admin check — authoritative DB query
  const api = await createClient();
  const { data: isSuperAdmin, error: rpcError } = await api.rpc('is_platform_super_admin');

  if (rpcError || !isSuperAdmin) {
    // Redirect non-super-admins — do NOT reveal whether the route exists
    redirect('/?error=access_denied');
  }

  // 3. Load profile for shell UI
  const profile = {
    full_name: user.user_metadata?.full_name || 'Super Admin',
    email: user.email,
  };

  // 4. Load pending approval count for badge
  const { count } = await api
    .from('tournaments')
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'PENDING_APPROVAL');

  return (
    <SuperAdminShell user={profile} pendingApprovals={count ?? 0}>
      {children}
    </SuperAdminShell>
  );
}
