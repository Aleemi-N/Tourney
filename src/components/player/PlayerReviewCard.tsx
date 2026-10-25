'use client';

import React from 'react';
import { PlayerCard, type PlayerCardProps } from './PlayerCard';

type PlayerReviewCardProps = PlayerCardProps & {
  onApprove?: () => void;
  onReject?: () => void;
  onClassify?: (category: 'ICON_LOT' | 'SETTER_LOT' | 'MAIN_AUCTION') => void;
  onRevokeApproval?: () => void;
  onReopenApplication?: () => void;
  isSubmitting?: boolean;
};

export function PlayerReviewCard({
  player,
  classification,
  status,
  tournamentColor,
  className,
  onApprove,
  onReject,
  onClassify,
  onRevokeApproval,
  onReopenApplication,
  isSubmitting
}: PlayerReviewCardProps) {
  const selectId = React.useId();
  const isActionable = status === 'PENDING' || status === 'CHANGES_REQUESTED';

  return (
    <PlayerCard
      player={player}
      classification={classification}
      status={status}
      tournamentColor={tournamentColor}
      className={className}
    >
      {(isActionable && (onApprove || onReject || onClassify)) || onRevokeApproval || onReopenApplication ? <div className="flex flex-col gap-4">
        {/* If pending/changes_requested, allow classification selection (if auction league) */}
        {status && ['PENDING', 'CHANGES_REQUESTED'].includes(status) && onClassify && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Classification
            </label>
            <select 
              id={selectId}
              name="classification"
              className="h-10 w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-primary shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              value={classification || ''}
              onChange={(e) => onClassify(e.target.value as 'ICON_LOT' | 'SETTER_LOT' | 'MAIN_AUCTION')}
              disabled={isSubmitting}
            >
              <option value="" disabled>Select Category...</option>
              <option value="ICON_LOT">Icon Player</option>
              <option value="SETTER_LOT">Setter Lot</option>
              <option value="MAIN_AUCTION">Main Auction</option>
            </select>
          </div>
        )}

        <div className="flex flex-col-reverse min-[350px]:flex-row gap-2 w-full mt-1">
          {onReject && (
            <button
              type="button"
              onClick={onReject}
              disabled={isSubmitting}
              className="h-10 flex-1 rounded-md border border-danger/30 dark:border-danger/30 bg-danger/10 dark:bg-danger/15 px-4 text-sm font-medium text-danger dark:text-danger shadow-sm hover:bg-danger/10 dark:hover:bg-danger/15 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          )}
          {onApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={isSubmitting || (onClassify !== undefined && !classification)}
              className="h-10 flex-1 rounded-md bg-success px-4 text-sm font-medium text-text-inverse shadow-sm hover:bg-success disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
        {onRevokeApproval && (
          <button type="button" onClick={onRevokeApproval} disabled={isSubmitting} className="self-start rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-warning/50 hover:text-warning disabled:opacity-50">
            Revoke Approval
          </button>
        )}
        {onReopenApplication && (
          <button type="button" onClick={onReopenApplication} disabled={isSubmitting} className="self-start rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-50">
            Reopen Application
          </button>
        )}
      </div> : null}
    </PlayerCard>
  );
}
