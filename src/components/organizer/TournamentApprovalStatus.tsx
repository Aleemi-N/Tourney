'use client';

/**
 * TournamentApprovalStatus — Organizer-facing approval lifecycle widget.
 *
 * Shows the current approval state clearly with:
 *  - APPROVED: continue normal workflow
 *  - PENDING_APPROVAL: waiting state, no submit button
 *  - REJECTED: reason visible, edit + resubmit button
 *  - APPROVED (never submitted): Submit for Approval button
 *
 * Does NOT grant organizer any admin access.
 * The actual approval is enforced server-side via RPC + trigger.
 */

import { useState, useTransition } from 'react';
import { submitTournamentForApproval } from '@/app/actions/super-admin';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';

type ApprovalStatus = 'APPROVED' | 'PENDING_APPROVAL' | 'REJECTED';

interface TournamentApprovalStatusProps {
  tournamentId: string;
  approvalStatus: ApprovalStatus;
  approvalSubmittedAt: string | null;
  rejectionReason: string | null;
  /** If true, this tournament has been submitted before (not a fresh draft) */
  hasBeenSubmitted: boolean;
}

export function TournamentApprovalStatus({
  tournamentId,
  approvalStatus,
  approvalSubmittedAt,
  rejectionReason,
  hasBeenSubmitted,
}: TournamentApprovalStatusProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState(approvalStatus);

  // Fresh draft that was grandfathered → APPROVED from migration but never submitted
  const isGrandfathered = approvalStatus === 'APPROVED' && !hasBeenSubmitted && !approvalSubmittedAt;

  function handleSubmit() {
    if (!confirm('Submit this tournament for Tourny platform approval?\n\nYour tournament will be reviewed before it can be made public.')) {
      return;
    }

    setError(null);
    setOptimisticStatus('PENDING_APPROVAL');

    startTransition(async () => {
      const result = await submitTournamentForApproval(tournamentId);
      if ('error' in result) {
        setError(result.error);
        setOptimisticStatus(approvalStatus);
      }
    });
  }

  if (optimisticStatus === 'APPROVED' && !isGrandfathered) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-success/20 bg-success/5">
        <CheckBadgeIcon className="w-5 h-5 text-success shrink-0" />
        <div>
          <p className="text-sm font-semibold text-success">Platform Approved</p>
          <p className="text-xs text-text-muted mt-0.5">This tournament is approved and can be published publicly.</p>
        </div>
      </div>
    );
  }

  if (optimisticStatus === 'PENDING_APPROVAL') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-warning/30 bg-warning/10">
        <ClockIcon className="w-5 h-5 text-warning shrink-0 animate-pulse" />
        <div>
          <p className="text-sm font-semibold text-warning">Pending Tourny Approval</p>
          <p className="text-xs text-text-muted mt-0.5">
            Waiting for platform review.{approvalSubmittedAt ? ` Submitted ${new Date(approvalSubmittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : ''} You cannot publish until approved.
          </p>
        </div>
      </div>
    );
  }

  if (optimisticStatus === 'REJECTED') {
    return (
      <div className="rounded-xl border border-danger/20 bg-danger/5 p-4">
        <div className="flex items-start gap-2 mb-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger">Tournament Rejected</p>
            <p className="text-xs text-text-muted mt-0.5">Address the feedback below, then resubmit.</p>
          </div>
        </div>

        {rejectionReason && (
          <div className="mb-3 rounded-lg bg-surface border border-border px-3 py-2">
            <p className="text-xs font-semibold text-text-secondary mb-1">Reviewer feedback:</p>
            <p className="text-sm text-text-primary">{rejectionReason}</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-danger mb-2">{error}</p>
        )}

        <button
          id={`resubmit-btn-${tournamentId}`}
          onClick={handleSubmit}
          disabled={isPending}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowPathIcon className="w-4 h-4" />
          {isPending ? 'Submitting…' : 'Resubmit for Approval'}
        </button>
      </div>
    );
  }

  // APPROVED but it's a fresh/grandfathered draft — show Submit button
  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4">
      <div className="flex items-start gap-2 mb-3">
        <CheckCircleIcon className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-text-secondary">Ready to Submit</p>
          <p className="text-xs text-text-muted mt-0.5">
            Submit for Tourny platform approval to make this tournament public.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-xs text-danger mb-2">{error}</p>
      )}

      <button
        id={`submit-approval-btn-${tournamentId}`}
        onClick={handleSubmit}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <PaperAirplaneIcon className="w-4 h-4" />
        {isPending ? 'Submitting…' : 'Submit for Approval'}
      </button>
    </div>
  );
}
