/**
 * /super-admin/organizers — Organizer management page
 */

import type { Metadata } from 'next';
import { getOrganizers } from '@/app/actions/super-admin';
import { OrganizerStatusButton } from '@/components/super-admin/OrganizerStatusButton';
import { UsersIcon, BuildingOfficeIcon, CalendarIcon } from '@heroicons/react/24/outline';

export const metadata: Metadata = {
  title: 'Organizer Management',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusPill({ status }: { status: string }) {
  const isSuspended = status === 'SUSPENDED';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
      ${isSuspended ? 'bg-danger/10 text-danger border border-danger/20' : 'bg-success/10 text-success border border-success/20'}`}>
      {isSuspended ? 'Suspended' : 'Active'}
    </span>
  );
}

export default async function OrganizersPage() {
  const result = await getOrganizers();

  if ('error' in result) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <p className="text-danger font-medium">{result.error}</p>
        </div>
      </div>
    );
  }

  const organizers = result.data ?? [];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-card">
            <UsersIcon className="w-5 h-5 text-text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Organizer Management</h1>
        </div>
        <p className="text-text-muted text-sm ml-12">
          Manage platform organizer accounts. Suspending does not delete tournament data.
        </p>
      </div>

      {/* Count */}
      <p className="text-sm text-text-muted mb-4">{organizers.length} organizer{organizers.length !== 1 ? 's' : ''}</p>

      {/* List */}
      {organizers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-16 text-center">
          <UsersIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">No organizers found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="divide-y divide-border">
            {organizers.map((item) => {
              const row = item as Record<string, unknown>;
              const profile = row.profiles as {
                id?: string;
                full_name?: string;
                email?: string;
                status?: string;
                created_at?: string;
              } | null;
              const org = row.organizations as { name?: string } | null;

              if (!profile) return null;

              return (
                <div
                  key={row.user_id as string}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 hover:bg-surface-muted transition-colors"
                >
                  {/* Identity */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                      {profile.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'OR'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-text-primary">{profile.full_name ?? '—'}</p>
                        <StatusPill status={profile.status ?? 'ACTIVE'} />
                      </div>
                      {profile.email && (
                        <p className="text-xs text-text-muted mt-0.5 truncate">{profile.email}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {org?.name && (
                          <span className="flex items-center gap-1 text-xs text-text-secondary">
                            <BuildingOfficeIcon className="w-3 h-3" />
                            {org.name}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-text-muted">
                          <CalendarIcon className="w-3 h-3" />
                          Joined {formatDate(profile.created_at ?? null)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action */}
                  <OrganizerStatusButton
                    userId={row.user_id as string}
                    currentStatus={profile.status ?? 'ACTIVE'}
                    fullName={profile.full_name ?? 'Organizer'}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notice */}
      <div className="mt-6 rounded-xl border border-border bg-surface-muted p-4">
        <p className="text-xs text-text-muted">
          <strong className="text-text-secondary">Note:</strong> Suspending an organizer sets their account status to SUSPENDED.
          Their tournament data, teams, and registrations are preserved and not deleted.
          Organizer impersonation is not available in V1.
        </p>
      </div>
    </div>
  );
}
