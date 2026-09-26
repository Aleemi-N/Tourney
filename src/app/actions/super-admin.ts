'use server';

/**
 * Super Admin server actions.
 *
 * All actions verify super-admin authority server-side via RPC/RLS.
 * Never trust client-side role claims.
 * Never expose service_role credentials.
 *
 * NOTE: The Supabase `.rpc()` call is typed against the generated Database
 * type. Because the new RPCs are added in migration 34 which hasn't been
 * applied to the local type-generation yet, we cast through `unknown` where
 * needed to satisfy the compiler without losing runtime safety.
 * After migration is applied and types are regenerated, these casts can be removed.
 */

import { createClient, getUser } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { PlatformDashboardMetrics } from '@/lib/super-admin-types';

// ---------------------------------------------------------------------------
// AUTH GUARD — reusable server-side super admin check
// ---------------------------------------------------------------------------

/**
 * Verify the calling user is a platform super admin.
 * Queries the DB directly — never trusts client-supplied claims.
 */
async function requireSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) {
    return { user: null, supabase, error: 'Not authenticated' as const };
  }

  // DB-authoritative check: row must exist in platform_super_admins
  const { data: isSuperAdmin, error } = await supabase.rpc('is_platform_super_admin');

  if (error || !isSuperAdmin) {
    return { user, supabase, error: 'Unauthorized: Super Admin access required' as const };
  }

  return { user, supabase, error: null };
}

// ---------------------------------------------------------------------------
// DASHBOARD METRICS
// ---------------------------------------------------------------------------

export async function getPlatformDashboardMetrics(): Promise<
  { data: PlatformDashboardMetrics } | { error: string }
> {
  const { supabase, error: authError } = await requireSuperAdmin();

  if (authError) {
    return { error: authError };
  }

  const { data, error } = await supabase.rpc('platform_dashboard_metrics');

  if (error) {
    console.error('platform_dashboard_metrics error:', error);
    return { error: 'Failed to load platform metrics.' };
  }

  return { data: data as unknown as PlatformDashboardMetrics };
}

// ---------------------------------------------------------------------------
// APPROVAL QUEUE
// ---------------------------------------------------------------------------

export async function getApprovalQueue() {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  // Use raw select since approval_status is in generated types now
  const { data, error } = await supabase
    .from('tournaments')
    .select(`
      id, name, format, league_mode, created_at,
      approval_status, approval_submitted_at,
      profiles!created_by (id, full_name),
      organizations (name)
    `)
    .eq('approval_status', 'PENDING_APPROVAL')
    .order('approval_submitted_at', { ascending: true });

  if (error) {
    console.error('getApprovalQueue error:', error);
    return { error: 'Failed to load approval queue.' };
  }

  return { data: data ?? [] };
}

export async function approveTournament(tournamentId: string): Promise<{ ok: boolean } | { error: string }> {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const { data, error } = await supabase.rpc('approve_tournament', {
    p_tournament_id: tournamentId,
  });

  if (error) {
    const msg = (error as { message?: string }).message || 'Failed to approve tournament.';
    return { error: msg };
  }

  revalidatePath('/super-admin/approvals');
  revalidatePath('/super-admin/tournaments');
  revalidatePath('/super-admin');

  const result = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
  return { ok: result?.ok === true };
}

export async function rejectTournament(
  tournamentId: string,
  reason: string,
): Promise<{ ok: boolean } | { error: string }> {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  if (!reason?.trim()) {
    return { error: 'Rejection reason is required.' };
  }

  const { data, error } = await supabase.rpc('reject_tournament', {
    p_tournament_id: tournamentId,
    p_reason: reason.trim(),
  });

  if (error) {
    const msg = (error as { message?: string }).message || 'Failed to reject tournament.';
    return { error: msg };
  }

  revalidatePath('/super-admin/approvals');
  revalidatePath('/super-admin/tournaments');
  revalidatePath('/super-admin');

  const result = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
  return { ok: result?.ok === true };
}

// ---------------------------------------------------------------------------
// TOURNAMENT MANAGEMENT
// ---------------------------------------------------------------------------

export async function getAllTournaments(filter?: {
  approvalStatus?: string;
  search?: string;
}) {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  let query = supabase.from('tournaments')
    .select(`
      id, name, slug, format, status, is_public, created_at,
      approval_status, approval_submitted_at, approval_reviewed_at,
      profiles!created_by (id, full_name, email),
      organizations (name)
    `)
    .order('created_at', { ascending: false });

  if (filter?.approvalStatus && filter.approvalStatus !== 'ALL') {
    query = query.eq('approval_status', filter.approvalStatus);
  }

  if (filter?.search) {
    query = query.ilike('name', `%${filter.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('getAllTournaments error:', error);
    return { error: 'Failed to load tournaments.' };
  }

  return { data: data ?? [] };
}

// ---------------------------------------------------------------------------
// ORGANIZER MANAGEMENT
// ---------------------------------------------------------------------------

export async function getOrganizers() {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  // Get all organization owners with tournament counts
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      user_id,
      profiles (id, full_name, email, status, created_at),
      organizations (id, name)
    `)
    .eq('role', 'OWNER')
    .eq('status', 'ACTIVE');

  if (error) {
    console.error('getOrganizers error:', error);
    return { error: 'Failed to load organizers.' };
  }

  return { data: data ?? [] };
}

export async function suspendOrganizer(
  userId: string,
  reason?: string,
): Promise<{ ok: boolean } | { error: string }> {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const { data, error } = await supabase.rpc('suspend_organizer', {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) {
    const msg = (error as { message?: string }).message || 'Failed to suspend organizer.';
    return { error: msg };
  }

  revalidatePath('/super-admin/organizers');

  const result = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
  return { ok: result?.ok === true };
}

export async function reactivateOrganizer(
  userId: string,
): Promise<{ ok: boolean } | { error: string }> {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const { data, error } = await supabase.rpc('reactivate_organizer', {
    p_user_id: userId,
  });

  if (error) {
    const msg = (error as { message?: string }).message || 'Failed to reactivate organizer.';
    return { error: msg };
  }

  revalidatePath('/super-admin/organizers');

  const result = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
  return { ok: result?.ok === true };
}

// ---------------------------------------------------------------------------
// AUDIT LOG
// ---------------------------------------------------------------------------

export async function getSuperAdminAuditLog(limit = 50) {
  const { supabase, error: authError } = await requireSuperAdmin();
  if (authError) return { error: authError };

  const superAdminActions = [
    'TOURNAMENT_SUBMITTED_FOR_APPROVAL',
    'TOURNAMENT_APPROVED',
    'TOURNAMENT_REJECTED',
    'TOURNAMENT_GRANDFATHERED_APPROVED',
    'ORGANIZER_SUSPENDED',
    'ORGANIZER_REACTIVATED',
  ];

  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      id, action, entity_type, entity_id, reason, created_at,
      before_json, after_json,
      profiles!user_id (id, full_name),
      tournaments (id, name)
    `)
    .in('action', superAdminActions)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getSuperAdminAuditLog error:', error);
    return { error: 'Failed to load audit log.' };
  }

  return { data: data ?? [] };
}

// ---------------------------------------------------------------------------
// ORGANIZER — Submit for approval (called by organizer, not super admin)
// ---------------------------------------------------------------------------

export async function submitTournamentForApproval(
  tournamentId: string,
): Promise<{ ok: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) return { error: 'Not authenticated' };

  const { data, error } = await supabase.rpc('submit_tournament_for_approval', {
    p_tournament_id: tournamentId,
  });

  if (error) {
    const msg = (error as { message?: string }).message || 'Failed to submit for approval.';
    return { error: msg };
  }

  revalidatePath(`/organizer/tournaments/${tournamentId}`);
  revalidatePath('/organizer/tournaments');

  const result = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
  return { ok: result?.ok === true };
}

// ---------------------------------------------------------------------------
// Super admin check for server components
// ---------------------------------------------------------------------------

export async function checkIsSuperAdmin(): Promise<boolean> {
  const { error } = await requireSuperAdmin();
  return error === null;
}
