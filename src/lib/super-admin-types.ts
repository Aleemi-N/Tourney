/**
 * Super Admin V1 — Database type augmentations.
 *
 * These types extend the generated types in lib/api/types.ts with the new tables
 * added in migration 20260929000034_super_admin_v1.sql.
 *
 * Import these as needed alongside Database from '@/lib/api/types'.
 */

export type ApprovalStatus = 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';

export type ApprovalEvent =
  | 'SUBMITTED_FOR_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'RESUBMITTED';

/** Row type for platform_super_admins table */
export interface PlatformSuperAdmin {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
}

/** Row type for tournament_approval_history table */
export interface TournamentApprovalHistory {
  id: string;
  tournament_id: string;
  event: ApprovalEvent;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

/**
 * Extended tournament row including super-admin approval columns.
 * The generated types will be updated after the migration.
 * Until then, use this augmented type where approval fields are needed.
 */
export interface TournamentWithApproval {
  id: string;
  name: string;
  slug: string;
  sport: string;
  format: string;
  league_mode: string | null;
  venue: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_start: string | null;
  registration_end: string | null;
  status: string;
  is_public: boolean;
  created_by: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  // Approval columns (from migration 34)
  approval_status: ApprovalStatus;
  approval_submitted_at: string | null;
  approval_reviewed_at: string | null;
  approval_reviewed_by: string | null;
  approval_rejection_reason: string | null;
}

/** Super admin dashboard metrics returned from platform_dashboard_metrics() RPC */
export interface PlatformDashboardMetrics {
  pending_approvals: number;
  approved_tournaments: number;
  active_tournaments: number;
  completed_tournaments: number;
  organizer_count: number;
  player_count: number;
  team_count: number;
  recent_submissions: Array<{
    id: string;
    name: string;
    approval_status: ApprovalStatus;
    approval_submitted_at: string | null;
    organizer_name: string;
    organizer_id: string;
  }> | null;
  recent_reviews: Array<{
    tournament_id: string;
    event: ApprovalEvent;
    created_at: string;
    reason: string | null;
    tournament_name: string;
    actor_name: string;
  }> | null;
}

/** Organizer management row */
export interface OrganizerRow {
  user_id: string;
  full_name: string;
  email: string | null;
  status: string;
  created_at: string;
  tournament_count: number;
  organization_name: string | null;
}

/** Approval queue item for the super admin queue page */
export interface ApprovalQueueItem {
  id: string;
  name: string;
  format: string;
  league_mode: string | null;
  created_at: string;
  approval_submitted_at: string | null;
  approval_status: ApprovalStatus;
  organizer_name: string;
  organizer_id: string;
  organization_name: string;
}
