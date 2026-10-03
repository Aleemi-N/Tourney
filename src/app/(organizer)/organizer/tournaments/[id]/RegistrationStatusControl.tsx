'use client';

import { useState, useTransition } from 'react';
import { closeRegistration, reopenRegistration } from '@/app/actions/tournament';
import { LockClosedIcon, LockOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface RegistrationStatusControlProps {
  tournamentId: string;
  status: string;
}

export function RegistrationStatusControl({ tournamentId, status }: RegistrationStatusControlProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const isOpen = status === 'REGISTRATION';
  const canClose = isOpen;
  const canReopen = status === 'PREPARATION';

  if (!canClose && !canReopen) return null;

  function handleClose() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setMessage(null);
    startTransition(async () => {
      const result = await closeRegistration(tournamentId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Registration closed. Tournament is now in Preparation phase.' });
      }
    });
  }

  function handleReopen() {
    setMessage(null);
    startTransition(async () => {
      const result = await reopenRegistration(tournamentId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Registration is now open again.' });
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Registration Status</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {isOpen
              ? 'Registration is currently open. Players/teams can register.'
              : 'Registration is closed. Reopen to allow new registrations.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canClose && (
            confirming ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-500 font-medium flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Confirm close?
                </span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={isPending}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-surface-raised transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  <LockClosedIcon className="w-3.5 h-3.5" />
                  {isPending ? 'Closing…' : 'Yes, Close'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-500 hover:bg-amber-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <LockClosedIcon className="w-3.5 h-3.5" />
                Close Registration
              </button>
            )
          )}

          {canReopen && (
            <button
              type="button"
              onClick={handleReopen}
              disabled={isPending}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <LockOpenIcon className="w-3.5 h-3.5" />
              {isPending ? 'Reopening…' : 'Reopen Registration'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs font-medium ${
            message.type === 'error'
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
