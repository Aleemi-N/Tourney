import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { TabFrame } from '@/components/tab-frame';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Loading } from '@/components/ui';
import { PortalShell, portalCard } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';
import { View } from 'react-native';

const TABS = [
  { key: 'index', label: 'Overview', path: '/admin' },
  { key: 'approvals', label: 'Approvals', path: '/admin/approvals' },
  { key: 'tournaments', label: 'Tournaments', path: '/admin/tournaments' },
  { key: 'organizers', label: 'Organizers', path: '/admin/organizers' },
  { key: 'audit', label: 'Audit log', path: '/admin/audit' },
] as const;
export type AdminTab = (typeof TABS)[number]['key'];

/** Whether the signed-in user is a platform super admin (checked by the database). */
export function useIsSuperAdmin() {
  const { session } = useAuth();
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    if (!session) return setAdmin(false);
    api.rpc('is_platform_super_admin').then(({ data }) => setAdmin(data === true));
  }, [session]);
  return admin;
}

export const adminDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Frame of the super admin pages; shows a sign-in or no-access state when the user is not a super admin. */
export function AdminFrame({ current, title, subtitle, children }: { current: AdminTab; title: string; subtitle?: string; children: ReactNode }) {
  const t = useTheme();
  const admin = useIsSuperAdmin();
  if (admin === null) return <PortalShell role="Super Admin" home={false}><Loading /></PortalShell>;
  if (!admin) {
    return (
      <PortalShell role="Super Admin" home={false}>
        <View style={portalCard(t)}><Text style={{ color: t.textSecondary, fontSize: 15 }}>This area is only for platform administrators.</Text></View>
        <Empty text="Sign in with an administrator account to continue." />
      </PortalShell>
    );
  }
  return (
    <TabFrame role="Super Admin" backLabel="Back to Account" backHref="/account" title={title} subtitle={subtitle} current={current}
      tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: tab.path }))}>
      {children}
    </TabFrame>
  );
}

export const openTournament = (id: string) => router.push({ pathname: '/organizer/[id]', params: { id } });
