'use client';

/**
 * Super Admin shell. Super Admin is a platform role, not a tournament role,
 * so it keeps its own navigation and a standing platform-area notice.
 */
import { ClipboardCheck, LayoutDashboard, ScrollText, ShieldAlert, Trophy, Users } from 'lucide-react';
import { AppShell } from '@/components/ui/AppShell';

interface SuperAdminShellProps {
  children: React.ReactNode;
  user?: {
    full_name: string;
    email?: string;
  };
  pendingApprovals?: number;
}

export function SuperAdminShell({ children, user, pendingApprovals = 0 }: SuperAdminShellProps) {
  const items = [
    { name: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
    { name: 'Approvals', href: '/super-admin/approvals', icon: ClipboardCheck, prefix: true, badge: pendingApprovals },
    { name: 'Tournaments', href: '/super-admin/tournaments', icon: Trophy, prefix: true },
    { name: 'Organizers', href: '/super-admin/organizers', icon: Users, prefix: true },
    { name: 'Audit log', shortName: 'Audit', href: '/super-admin/audit', icon: ScrollText, prefix: true },
  ];

  return (
    <AppShell
      portal="Super admin"
      homeHref="/super-admin"
      sections={[{ items }]}
      user={user}
      notice={
        <p className="flex items-center gap-2 border-b border-warning/20 bg-warning/10 px-4 py-2 text-sm font-medium text-warning sm:px-8">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          Platform admin area: changes here affect every organizer.
        </p>
      }
    >
      {children}
    </AppShell>
  );
}
