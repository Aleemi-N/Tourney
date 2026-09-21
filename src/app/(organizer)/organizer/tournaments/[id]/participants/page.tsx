import { getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ParticipantListServer } from './ParticipantListServer';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Suspense } from 'react';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';

export const dynamic = 'force-dynamic';

function ParticipantListSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-72 bg-surface rounded-xl border border-border" />
        ))}
      </div>
    </div>
  );
}

async function ParticipantsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch tournament from cache
  const { data: tournament } = await getTournament(id);
  if (!tournament) {
    notFound();
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen">
      <div className="mb-6 flex flex-col gap-2">
        <Link 
          href={`/organizer/tournaments/${id}`}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors w-fit"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Tournament
          <OrganizerLinkPending />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Participant Management</h1>
          <p className="text-slate-500 mt-1">{tournament.name}</p>
        </div>
      </div>

      <Suspense fallback={<ParticipantListSkeleton />}>
        <ParticipantListServer tournament={tournament} />
      </Suspense>
    </div>
  );
}

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ParticipantsPageSkeleton />}>
      <ParticipantsContent params={params} />
    </Suspense>
  );
}

function ParticipantsPageSkeleton() {
  return (
    <main className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto" aria-label="Loading participants">
      <div className="mb-6 space-y-3 animate-pulse">
        <div className="h-4 w-36 rounded bg-surface-muted" />
        <div className="h-9 w-64 max-w-full rounded-lg bg-surface-muted" />
        <div className="h-4 w-44 rounded bg-surface-muted" />
      </div>
      <ParticipantListSkeleton />
    </main>
  );
}
