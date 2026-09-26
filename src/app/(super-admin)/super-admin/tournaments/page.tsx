/**
 * /super-admin/tournaments — Tournament management page
 *
 * View all tournaments across the platform with filtering and search.
 * No destructive delete operations in V1.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllTournaments } from '@/app/actions/super-admin';
import { TournamentFilters } from '@/components/super-admin/TournamentFilters';
import { TrophyIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import type { ApprovalStatus } from '@/lib/super-admin-types';

export const metadata: Metadata = {
  title: 'Tournament Management',
};

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string }>;
}

function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const cfg: Record<ApprovalStatus, string> = {
    APPROVED: 'bg-success/10 text-success border border-success/20',
    PENDING_APPROVAL: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    REJECTED: 'bg-danger/10 text-danger border border-danger/20',
  };

  const label: Record<ApprovalStatus, string> = {
    APPROVED: 'Approved',
    PENDING_APPROVAL: 'Pending',
    REJECTED: 'Rejected',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? 'bg-surface-muted text-text-muted'}`}>
      {label[status] ?? status}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfgMap: Record<string, string> = {
    DRAFT: 'bg-surface-muted text-text-muted',
    REGISTRATION: 'bg-info/10 text-info border border-info/20',
    PREPARATION: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    LIVE: 'bg-danger/10 text-danger border border-danger/20',
    COMPLETED: 'bg-success/10 text-success border border-success/20',
    ARCHIVED: 'bg-surface-muted text-text-muted',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cfgMap[status] ?? 'bg-surface-muted text-text-muted'}`}>
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function TournamentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const result = await getAllTournaments({
    approvalStatus: params.status ?? 'ALL',
    search: params.q,
  });

  if ('error' in result) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-danger font-medium">{result.error}</p>
        </div>
      </div>
    );
  }

  const tournaments: any[] = result.data ?? [];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <TrophyIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Tournament Management</h1>
        </div>
        <p className="text-text-muted text-sm ml-12">Platform-wide view of all tournaments.</p>
      </div>

      {/* Filters */}
      <TournamentFilters />

      {/* Count */}
      <p className="text-sm text-text-muted mb-4">
        {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
      </p>

      {/* Table */}
      {tournaments.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-16 text-center">
          <TrophyIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No tournaments match the current filter.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          {/* Desktop table header */}
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 bg-surface-muted border-b border-border text-xs font-semibold text-text-muted uppercase tracking-wider">
            <span>Tournament</span>
            <span>Format</span>
            <span>Status</span>
            <span>Approval</span>
            <span>Created</span>
            <span>Link</span>
          </div>

          <div className="divide-y divide-border">
            {tournaments.map((item: any) => {
              const profile = item.profiles as { full_name?: string; email?: string } | null;
              const org = item.organizations as { name?: string } | null;

              return (
                <div
                  key={String(item.id)}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 px-5 py-4 hover:bg-surface-muted/50 transition-colors"
                >
                  {/* Name + organizer */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{String(item.name)}</p>
                    <p className="text-xs text-text-muted truncate">{profile?.full_name ?? '—'} · {org?.name ?? '—'}</p>
                  </div>

                  <div className="flex md:block items-center gap-2">
                    <span className="md:hidden text-xs text-text-muted w-20">Format</span>
                    <span className="text-sm text-text-secondary">{String(item.format)}</span>
                  </div>

                  <div className="flex md:block items-center gap-2">
                    <span className="md:hidden text-xs text-text-muted w-20">Status</span>
                    <StatusBadge status={String(item.status)} />
                  </div>

                  <div className="flex md:block items-center gap-2">
                    <span className="md:hidden text-xs text-text-muted w-20">Approval</span>
                    <ApprovalBadge status={String(item.approval_status) as ApprovalStatus} />
                  </div>

                  <div className="flex md:block items-center gap-2">
                    <span className="md:hidden text-xs text-text-muted w-20">Created</span>
                    <span className="text-sm text-text-secondary">{formatDate(item.created_at as string)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.is_public && (
                      <a
                        href={`/t/${String(item.slug)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-violet-400 hover:text-violet-300 transition-colors"
                        title="View public page"
                      >
                        <GlobeAltIcon className="w-4 h-4" />
                      </a>
                    )}
                    {item.approval_status === 'PENDING_APPROVAL' && (
                      <Link
                        href="/super-admin/approvals"
                        className="text-xs text-amber-400 hover:underline font-medium"
                      >
                        Review
                      </Link>
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
