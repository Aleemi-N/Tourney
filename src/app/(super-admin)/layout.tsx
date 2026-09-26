/* eslint-disable @typescript-eslint/no-explicit-any */
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
 *
 * NOTE: New RPCs use `any` casts until the Database type is regenerated
 * after the migration is applied to Supabase.
 */

import { redirect } from 'next/navigation';
import { createClient, getUser } from '@/lib/supabase/server';
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
  // Cast through `any` because is_platform_super_admin is a new RPC not yet in types.
  const supabase = await createClient();
  const { data: isSuperAdmin, error: rpcError } = await (supabase.rpc as any)('is_platform_super_admin') as { data: boolean | null; error: any };

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
  const { count } = await (supabase
    .from('tournaments') as any)
    .select('*', { count: 'exact', head: true })
    .eq('approval_status', 'PENDING_APPROVAL') as { count: number | null };

  return (
    <SuperAdminShell user={profile} pendingApprovals={count ?? 0}>
      {children}
    </SuperAdminShell>
  );
}
