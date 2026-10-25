import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  neutral: 'bg-surface-muted text-text-secondary',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  live: 'bg-live/10 text-live',
} as const;

export type StatusTone = keyof typeof TONES;

// Labels from docs/design.md §16. Status strings mean the same thing across tournaments,
// registrations, matches, auction players and lot sessions, so one map covers them all.
const STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  REGISTRATION: { label: 'Registration open', tone: 'success' },
  PREPARATION: { label: 'Preparation', tone: 'info' },
  LIVE: { label: 'Live', tone: 'live' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
  ARCHIVED: { label: 'Archived', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
  SCHEDULED: { label: 'Scheduled', tone: 'info' },
  POSTPONED: { label: 'Postponed', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  WAITING: { label: 'Waiting', tone: 'neutral' },
  SOLD: { label: 'Sold', tone: 'success' },
  UNSOLD: { label: 'Unsold', tone: 'neutral' },
  READY: { label: 'Ready', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  PREPARING: { label: 'Preparing', tone: 'neutral' },
  SHUFFLED: { label: 'Shuffled', tone: 'info' },
  ACTIVE: { label: 'Active', tone: 'success' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
};

export function statusLabel(status: string) {
  return STATUSES[status]?.label ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

/** A status chip: always a text label, with a dot so state never relies on colour alone. */
export function StatusPill({
  status,
  tone,
  children,
  className,
}: {
  status?: string;
  tone?: StatusTone;
  children?: ReactNode;
  className?: string;
}) {
  const resolvedTone = tone ?? (status ? STATUSES[status]?.tone : undefined) ?? 'neutral';
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', TONES[resolvedTone], className)}>
      <span
        className={cn('h-1.5 w-1.5 shrink-0 rounded-full bg-current', resolvedTone === 'live' && 'animate-pulse')}
        aria-hidden="true"
      />
      {children ?? (status ? statusLabel(status) : null)}
    </span>
  );
}
