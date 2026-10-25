/**
 * /super-admin/audit — Audit log for super admin operations
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata } from 'next';
import { getSuperAdminAuditLog } from '@/app/actions/super-admin';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import { CheckBadgeIcon, ExclamationTriangleIcon, ClockIcon, NoSymbolIcon, CheckCircleIcon, TrophyIcon } from '@heroicons/react/24/solid';

export const metadata: Metadata = {
  title: 'Audit Log',
};

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ACTION_CONFIG: Record<string, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = {
  TOURNAMENT_APPROVED: {
    label: 'Tournament Approved',
    icon: CheckBadgeIcon,
    color: 'text-success',
  },
  TOURNAMENT_REJECTED: {
    label: 'Tournament Rejected',
    icon: ExclamationTriangleIcon,
    color: 'text-danger',
  },
  TOURNAMENT_SUBMITTED_FOR_APPROVAL: {
    label: 'Submitted for Approval',
    icon: ClockIcon,
    color: 'text-warning',
  },
  TOURNAMENT_GRANDFATHERED_APPROVED: {
    label: 'Grandfathered (Pre-existing)',
    icon: TrophyIcon,
    color: 'text-info',
  },
  ORGANIZER_SUSPENDED: {
    label: 'Organizer Suspended',
    icon: NoSymbolIcon,
    color: 'text-danger',
  },
  ORGANIZER_REACTIVATED: {
    label: 'Organizer Reactivated',
    icon: CheckCircleIcon,
    color: 'text-success',
  },
};

export default async function AuditPage() {
  const result = await getSuperAdminAuditLog(100);

  if ('error' in result) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-danger font-medium">{result.error}</p>
        </div>
      </div>
    );
  }

  const logs: any[] = result.data ?? [];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-card">
            <ClipboardDocumentListIcon className="w-5 h-5 text-text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Audit Log</h1>
        </div>
        <p className="text-text-muted text-sm ml-12">
          Immutable record of all platform-level administrative operations.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-16 text-center">
          <ClipboardDocumentListIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No audit events yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log: any) => {
              const l = log as Record<string, unknown>;
              const actor = l.profiles as { full_name?: string } | null;
              const tournament = l.tournaments as { name?: string; id?: string } | null;
              const actionStr = String(l.action);
              const config = ACTION_CONFIG[actionStr] ?? {
                label: actionStr,
                icon: ClipboardDocumentListIcon,
                color: 'text-text-muted',
              };
              const Icon = config.icon;

              return (
                <div key={l.id as string} className="flex items-start gap-4 px-5 py-4 hover:bg-surface-muted transition-colors">
                  {/* Icon */}
                  <div className={`mt-0.5 shrink-0 ${config.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-text-primary">{config.label}</span>
                      {tournament?.name && (
                        <span className="text-xs text-text-muted">· {tournament.name}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-xs text-text-muted">
                        by <span className="text-text-secondary">{actor?.full_name ?? 'System'}</span>
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatDateTime(String(l.created_at))}
                      </span>
                    </div>

                    {Boolean(l.reason) && (
                      <p className="mt-1 text-xs text-text-secondary bg-surface-muted rounded px-2 py-1 inline-block">
                        &quot;{String(l.reason)}&quot;
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
