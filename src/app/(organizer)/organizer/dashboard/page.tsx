import type { Metadata } from 'next';
import { createClient, getUser } from '@/lib/supabase/server';
import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/24/outline';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardTournamentsServer } from './DashboardTournamentsServer';

export const metadata: Metadata = { title: 'Organizer Dashboard' };
export const dynamic = 'force-dynamic';

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border p-5 rounded-xl h-48" />
        ))}
      </div>
    </div>
  );
}

export default async function OrganizerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) {
    return null; // redirect handled in proxy
  }

  // Get tournaments for the user's organization
  // Since a user might have multiple organizations, we'll get their organizations first
  const { data: orgs } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  const orgIds = orgs?.map((o) => o.organization_id) || [];

  if (orgIds.length === 0) {
    redirect('/organizer/onboarding');
  }

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Dashboard</h1>
          <p className="text-text-secondary mt-1">Manage your tournaments and events.</p>
        </div>
        <Link
          href="/organizer/tournaments/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Create Tournament
        </Link>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardTournamentsServer orgIds={orgIds} />
      </Suspense>
    </main>
  );
}
