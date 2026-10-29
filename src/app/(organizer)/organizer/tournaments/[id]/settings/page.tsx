import { getTournament } from '@/lib/api/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { SettingsServer } from './SettingsServer';
import { Suspense } from 'react';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';

export const dynamic = 'force-dynamic';

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse mt-8">
      <div className="h-10 w-48 bg-surface-muted dark:bg-surface rounded-md" />
      <div className="h-64 w-full bg-surface-muted dark:bg-surface rounded-xl" />
      <div className="h-48 w-full bg-surface-muted dark:bg-surface rounded-xl" />
    </div>
  );
}

async function SettingsContent({ params }: { params: Promise<{ id: string }> }) {
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
          <OrganizerLinkPending className="ml-2" />
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-text-secondary mt-1">
          Manage tournament details, registration, and auction rules for {tournament.name}.
        </p>
      </div>

      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsServer tournament={tournament} />
      </Suspense>
    </main>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<SettingsPageSkeleton />}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

function SettingsPageSkeleton() {
  return (
    <main className="p-4 md:p-8 max-w-4xl mx-auto" aria-label="Loading tournament settings">
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-32 rounded bg-surface-muted" />
        <div className="space-y-3">
          <div className="h-9 w-40 rounded-lg bg-surface-muted" />
          <div className="h-4 w-72 max-w-full rounded bg-surface-muted" />
        </div>
        <SettingsSkeleton />
      </div>
    </main>
  );
}
