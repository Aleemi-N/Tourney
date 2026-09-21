'use client';

import React from 'react';
import { PlayerCard, type PlayerCardProps } from './PlayerCard';

type PlayerReviewCardProps = PlayerCardProps & {
  onApprove?: () => void;
  onReject?: () => void;
  onClassify?: (category: 'ICON_LOT' | 'SETTER_LOT' | 'MAIN_AUCTION') => void;
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
  isSubmitting
}: PlayerReviewCardProps) {
  const selectId = React.useId();

  return (
    <PlayerCard
      player={player}
      classification={classification}
      status={status}
      tournamentColor={tournamentColor}
      className={className}
    >
      <div className="flex flex-col gap-4">
        {/* If pending/changes_requested, allow classification selection (if auction league) */}
        {status && ['PENDING', 'CHANGES_REQUESTED'].includes(status) && onClassify && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={selectId} className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
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
          {onReject && status !== 'REJECTED' && (
            <button
              type="button"
              onClick={onReject}
              disabled={isSubmitting}
              className="h-10 flex-1 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 text-sm font-medium text-red-600 dark:text-red-400 shadow-sm hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
          )}
          {onApprove && status !== 'APPROVED' && (
            <button
              type="button"
              onClick={onApprove}
              disabled={isSubmitting || (onClassify !== undefined && !classification)}
              className="h-10 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      </div>
    </PlayerCard>
  );
}
