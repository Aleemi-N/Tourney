/**
 * Super Admin Dashboard — /super-admin
 *
 * Platform-level metrics overview:
 *  • Pending approvals (primary KPI)
 *  • Tournament counts by state
 *  • Platform totals: organizers, players, teams
 *  • Recent submissions feed
 *  • Recent approval/rejection activity
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { getPlatformDashboardMetrics } from '@/app/actions/super-admin';
import {
  ClipboardDocumentCheckIcon,
  TrophyIcon,
  UsersIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { ExclamationTriangleIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import type { ApprovalStatus } from '@/lib/super-admin-types';

export const metadata: Metadata = {
  title: 'Platform Dashboard',
};

function MetricCard({
  label,
  value,
  icon: Icon,
  href,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  highlight?: 'warning' | 'success' | 'info';
}) {
  const highlightClassMap: Record<string, string> = {
    warning: 'border-amber-500/30 bg-amber-500/5',
    success: 'border-success/30 bg-success/5',
    info: 'border-info/30 bg-info/5',
  };
  const highlightClass = highlight ? (highlightClassMap[highlight] ?? 'border-border bg-surface') : 'border-border bg-surface';

  const iconClassMap: Record<string, string> = {
    warning: 'text-amber-400',
    success: 'text-success',
    info: 'text-info',
  };
  const iconClass = highlight ? (iconClassMap[highlight] ?? 'text-text-muted') : 'text-text-muted';

  const content = (
    <div className={`rounded-xl border p-5 transition-all ${highlightClass} ${href ? 'hover:border-border-strong cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-text-primary">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-lg bg-surface-muted flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${iconClass}`} />
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const config = {
    APPROVED: { label: 'Approved', cls: 'bg-success/10 text-success border border-success/20' },
    PENDING_APPROVAL: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
    REJECTED: { label: 'Rejected', cls: 'bg-danger/10 text-danger border border-danger/20' },
  }[status] ?? { label: status, cls: 'bg-surface-muted text-text-muted' };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.cls}`}>
      {config.label}
    </span>
  );
}

function ActivityIcon({ event }: { event: string }) {
  if (event === 'APPROVED') return <CheckBadgeIcon className="w-4 h-4 text-success" />;
  if (event === 'REJECTED') return <ExclamationTriangleIcon className="w-4 h-4 text-danger" />;
  return <ClockIcon className="w-4 h-4 text-amber-400" />;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function SuperAdminDashboard() {
  const result = await getPlatformDashboardMetrics();

  if ('error' in result) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-danger font-medium">Failed to load dashboard: {result.error}</p>
        </div>
      </div>
    );
  }

  const metrics = result.data;

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <ChartBarIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Platform Dashboard</h1>
        </div>
        <p className="text-text-muted text-sm ml-12">Overview of the Tourny platform.</p>
      </div>

      {/* Pending Approvals — Primary KPI */}
      {metrics.pending_approvals > 0 && (
        <Link href="/super-admin/approvals">
          <div className="mb-6 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-amber-600/5 p-5 flex items-center gap-4 hover:border-amber-500/60 transition-all cursor-pointer group">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <ClipboardDocumentCheckIcon className="w-6 h-6 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-amber-400 font-semibold">Action Required</p>
              <p className="text-lg font-bold text-text-primary">
                {metrics.pending_approvals} tournament{metrics.pending_approvals !== 1 ? 's' : ''} pending approval
              </p>
            </div>
            <span className="text-amber-400 text-sm font-medium group-hover:underline">Review →</span>
          </div>
        </Link>
      )}

      {/* Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Pending Approval"
          value={metrics.pending_approvals}
          icon={ClipboardDocumentCheckIcon}
          href="/super-admin/approvals"
          highlight={metrics.pending_approvals > 0 ? 'warning' : undefined}
        />
        <MetricCard
          label="Approved Tournaments"
          value={metrics.approved_tournaments}
          icon={CheckCircleIcon}
          highlight="success"
        />
        <MetricCard
          label="Active Tournaments"
          value={metrics.active_tournaments}
          icon={TrophyIcon}
          href="/super-admin/tournaments"
        />
        <MetricCard
          label="Completed"
          value={metrics.completed_tournaments}
          icon={ChartBarIcon}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <MetricCard
          label="Organizers"
          value={metrics.organizer_count}
          icon={UsersIcon}
          href="/super-admin/organizers"
          highlight="info"
        />
        <MetricCard
          label="Players"
          value={metrics.player_count}
          icon={UserGroupIcon}
        />
        <MetricCard
          label="Active Teams"
          value={metrics.team_count}
          icon={UserGroupIcon}
        />
      </div>

      {/* Two column: Recent Submissions + Recent Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Submissions */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Recent Submissions</h2>
            <Link href="/super-admin/approvals" className="text-xs text-violet-400 hover:underline">View all</Link>
          </div>
          {(!metrics.recent_submissions || metrics.recent_submissions.length === 0) ? (
            <p className="text-text-muted text-sm text-center py-6">No recent submissions.</p>
          ) : (
            <ul className="space-y-3">
              {metrics.recent_submissions.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                    <TrophyIcon className="w-4 h-4 text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                    <p className="text-xs text-text-muted truncate">by {s.organizer_name}</p>
                  </div>
                  <div className="shrink-0">
                    <ApprovalStatusBadge status={s.approval_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent Reviews */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Recent Reviews</h2>
            <Link href="/super-admin/audit" className="text-xs text-violet-400 hover:underline">Full audit</Link>
          </div>
          {(!metrics.recent_reviews || metrics.recent_reviews.length === 0) ? (
            <p className="text-text-muted text-sm text-center py-6">No recent review activity.</p>
          ) : (
            <ul className="space-y-3">
              {metrics.recent_reviews.map((r, idx) => (
                <li key={`${r.tournament_id}-${idx}`} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <ActivityIcon event={r.event} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">
                      <span className="font-medium">{r.actor_name}</span>{' '}
                      <span className="text-text-secondary">{r.event === 'APPROVED' ? 'approved' : 'rejected'}</span>{' '}
                      <span className="font-medium">{r.tournament_name}</span>
                    </p>
                    {r.reason && (
                      <p className="text-xs text-text-muted truncate mt-0.5">&quot;{r.reason}&quot;</p>
                    )}
                    <p className="text-xs text-text-muted mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
