/**
 * /super-admin/approvals — Approval queue page
 *
 * Shows all PENDING_APPROVAL tournaments ordered by submission date (oldest first).
 * Super Admin can approve or reject each tournament.
 * Concurrency handled at RPC level (SELECT FOR UPDATE).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata } from 'next';
import { getApprovalQueue } from '@/app/actions/super-admin';
import { ApprovalActions } from '@/components/super-admin/ApprovalActions';
import { ClipboardDocumentCheckIcon, TrophyIcon, UserIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { InboxIcon } from '@heroicons/react/24/solid';

export const metadata: Metadata = {
  title: 'Approval Queue',
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function FormatBadge({ format, leagueMode }: { format: string; leagueMode: string | null }) {
  const label = format === 'LEAGUE' ? `League${leagueMode ? ` · ${leagueMode.replace('_', ' ')}` : ''}` : 'Knockout';
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-surface-muted text-text-secondary border border-border">
      {label}
    </span>
  );
}

export default async function ApprovalsPage() {
  const result = await getApprovalQueue();

  if ('error' in result) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-danger font-medium">{result.error}</p>
        </div>
      </div>
    );
  }

  const queue: any[] = result.data ?? [];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-warning flex items-center justify-center shadow-card">
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">Approval Queue</h1>
            {queue.length > 0 && (
              <p className="text-sm text-warning font-medium">{queue.length} pending review</p>
            )}
          </div>
        </div>
        <p className="text-text-muted text-sm ml-12">
          Review tournament submissions from organizers. Approving allows them to launch publicly.
        </p>
      </div>

      {/* Empty State */}
      {queue.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-16 text-center">
          <InboxIcon className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-text-primary mb-2">Queue is clear</h2>
          <p className="text-text-muted text-sm">No tournaments are waiting for approval right now.</p>
        </div>
      )}

      {/* Queue Items */}
      {queue.length > 0 && (
        <div className="space-y-4">
          {queue.map((item: any) => {
            const profiles = item.profiles as { id?: string; full_name?: string } | null;
            const organizations = item.organizations as { name?: string } | null;

            return (
              <div
                key={String(item.id)}
                className="rounded-2xl border border-border bg-surface p-5 md:p-6 hover:border-border-strong transition-all"
              >
                <div className="flex flex-col lg:flex-row gap-5">
                  {/* Tournament Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start gap-2 mb-3">
                      <h2 className="text-lg font-bold text-text-primary">{String(item.name)}</h2>
                      <FormatBadge format={String(item.format)} leagueMode={item.league_mode as string | null} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <UserIcon className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="truncate">{profiles?.full_name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <TrophyIcon className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="truncate">{organizations?.name ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-text-secondary">
                        <CalendarIcon className="w-4 h-4 text-text-muted shrink-0" />
                        <span>Created {formatDate(item.created_at as string)}</span>
                      </div>
                    </div>

                    {item.approval_submitted_at && (
                      <p className="mt-2 text-xs text-warning font-medium">
                        Submitted: {formatDate(item.approval_submitted_at as string)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="lg:w-64 shrink-0">
                    <ApprovalActions
                      tournamentId={String(item.id)}
                      tournamentName={String(item.name)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
