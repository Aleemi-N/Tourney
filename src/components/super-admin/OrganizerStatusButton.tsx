'use client';

/**
 * OrganizerStatusButton — Suspend / Reactivate organizer with confirmation.
 */

import { useState, useTransition } from 'react';
import { suspendOrganizer, reactivateOrganizer } from '@/app/actions/super-admin';
import { NoSymbolIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface OrganizerStatusButtonProps {
  userId: string;
  currentStatus: string;
  fullName: string;
}

export function OrganizerStatusButton({ userId, currentStatus, fullName }: OrganizerStatusButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);

  const isSuspended = optimisticStatus === 'SUSPENDED';

  function handleToggle() {
    const confirmMsg = isSuspended
      ? `Reactivate "${fullName}"?\n\nThey will regain normal organizer access.`
      : `Suspend "${fullName}"?\n\nTheir tournament data will NOT be deleted. They will not be able to log in or manage tournaments.`;

    if (!confirm(confirmMsg)) return;

    setError(null);
    const newStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';
    setOptimisticStatus(newStatus); // Optimistic update

    startTransition(async () => {
      const result = isSuspended
        ? await reactivateOrganizer(userId)
        : await suspendOrganizer(userId, 'Suspended by Super Admin');

      if ('error' in result) {
        setError(result.error);
        setOptimisticStatus(currentStatus); // Revert on failure
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        id={`organizer-toggle-${userId}`}
        onClick={handleToggle}
        disabled={isPending}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed
          ${isSuspended
            ? 'bg-success/10 text-success border border-success/20 hover:bg-success/20'
            : 'bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20'}`}
      >
        {isSuspended ? (
          <><CheckCircleIcon className="w-3.5 h-3.5" /> Reactivate</>
        ) : (
          <><NoSymbolIcon className="w-3.5 h-3.5" /> Suspend</>
        )}
      </button>
      {error && <p className="text-xs text-danger max-w-[160px] text-right">{error}</p>}
    </div>
  );
}
