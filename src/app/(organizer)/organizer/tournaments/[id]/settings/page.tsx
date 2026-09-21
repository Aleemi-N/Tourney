import { getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { SettingsServer } from './SettingsServer';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse mt-8">
      <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-md" />
      <div className="h-64 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="h-48 w-full bg-slate-200 dark:bg-slate-800 rounded-xl" />
    </div>
  );
}

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Fetch Tournament from cache (shared with layout)
  const { data: tournament } = await getTournament(id);

  if (!tournament) {
    notFound();
  }

  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link 
          href={`/organizer/tournaments/${id}`}
          className="inline-flex items-center text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back to Overview
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary mt-1">
          Configure registration and auction rules for {tournament.name}.
        </p>
      </div>

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsServer tournament={tournament} />
      </Suspense>
    </main>
  );
}

