'use client';

/**
 * ApprovalActions — approve/reject buttons with confirmation dialogs.
 *
 * Prevents double-submission via loading state.
 * Reject requires a non-empty reason.
 * Uses native browser dialog for minimal dependencies.
 */

import { useState, useTransition } from 'react';
import { approveTournament, rejectTournament } from '@/app/actions/super-admin';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface ApprovalActionsProps {
  tournamentId: string;
  tournamentName: string;
}

export function ApprovalActions({ tournamentId, tournamentName }: ApprovalActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);

  function handleApprove() {
    if (!confirm(`Approve "${tournamentName}"?\n\nThe organizer will be notified and can proceed with their tournament.`)) return;

    setError(null);
    setSuccess(null);
    setActionType('approve');

    startTransition(async () => {
      const result = await approveTournament(tournamentId);
      if ('error' in result) {
        setError(result.error);
      } else {
        setSuccess('Tournament approved successfully.');
      }
      setActionType(null);
    });
  }

  function handleRejectConfirm() {
    if (!rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }

    setError(null);
    setSuccess(null);
    setShowRejectDialog(false);
    setActionType('reject');

    startTransition(async () => {
      const result = await rejectTournament(tournamentId, rejectReason.trim());
      if ('error' in result) {
        setError(result.error);
      } else {
        setSuccess('Tournament rejected. The organizer will see the reason and can resubmit.');
      }
      setActionType(null);
      setRejectReason('');
    });
  }

  if (success) {
    return (
      <div className="flex items-center gap-2 text-sm text-success font-medium px-3 py-2 rounded-lg bg-success/10 border border-success/20">
        <CheckCircleIcon className="w-4 h-4 shrink-0" />
        {success}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          id={`approve-btn-${tournamentId}`}
          onClick={handleApprove}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-success text-text-inverse text-sm font-semibold hover:bg-success/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircleIcon className="w-4 h-4" />
          {actionType === 'approve' ? 'Approving…' : 'Approve'}
        </button>

        <button
          id={`reject-btn-${tournamentId}`}
          onClick={() => { setError(null); setShowRejectDialog(true); }}
          disabled={isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-danger/10 text-danger border border-danger/20 text-sm font-semibold hover:bg-danger/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircleIcon className="w-4 h-4" />
          {actionType === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
            <h2 className="text-lg font-bold text-text-primary mb-1">Reject Tournament</h2>
            <p className="text-sm text-text-secondary mb-4">
              Rejecting <span className="font-semibold text-text-primary">&quot;{tournamentName}&quot;</span>.
              The organizer will see this reason and can edit and resubmit.
            </p>

            <label htmlFor="reject-reason" className="block text-sm font-medium text-text-secondary mb-2">
              Rejection Reason <span className="text-danger">*</span>
            </label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Provide a clear reason so the organizer can address it…"
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              autoFocus
            />

            {error && (
              <p className="mt-2 text-sm text-danger">{error}</p>
            )}

            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectDialog(false); setRejectReason(''); setError(null); }}
                className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
              >
                Cancel
              </button>
              <button
                id={`reject-confirm-btn-${tournamentId}`}
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim()}
                className="px-4 py-2 rounded-lg bg-danger text-text-inverse text-sm font-semibold hover:bg-danger/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
