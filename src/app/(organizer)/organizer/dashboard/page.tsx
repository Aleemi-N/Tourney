import type { Metadata } from 'next';
import { getUser } from '@/lib/supabase/server';
import Link from 'next/link';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Suspense } from 'react';
import { DashboardTournamentsServer } from './DashboardTournamentsServer';

export const metadata: Metadata = { title: 'Organizer Dashboard' };
export const dynamic = 'force-dynamic';

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface border border-border/80 p-6 rounded-2xl h-56" />
        ))}
      </div>
    </div>
  );
}

export default async function OrganizerDashboardPage() {
  const { data: { user } } = await getUser();

  if (!user) {
    return null; // redirect handled in proxy
  }

  return (
    <main className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 relative">
        {/* Subtle decorative glow for the header */}
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-primary tracking-tight">
            Welcome back, {user.user_metadata?.full_name?.split(' ')[0] || 'Organizer'}
          </h1>
          <p className="text-text-secondary mt-1.5 text-base sm:text-lg">
            Manage your tournaments and events.
          </p>
        </div>
        <Link
          href="/organizer/tournaments/new"
          className="relative z-10 inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 bg-primary text-primary-foreground font-semibold rounded-2xl hover:shadow-primary/30 transition-all duration-300 active:scale-95"
        >
          <PlusIcon className="w-5 h-5" />
          Create Tournament
        </Link>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardTournamentsServer userId={user.id} />
      </Suspense>
    </main>
  );
}
