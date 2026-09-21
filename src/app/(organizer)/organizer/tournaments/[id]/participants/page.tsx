import { getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ParticipantListServer } from './ParticipantListServer';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

function ParticipantsSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="h-10 w-48 bg-slate-200 dark:bg-slate-800 rounded-md" />
        <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded-md" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
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
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Participant Management</h1>
          <p className="text-slate-500 mt-1">{tournament.name}</p>
        </div>
      </div>

      <Suspense fallback={<ParticipantsSkeleton />}>
        <ParticipantListServer tournament={tournament} />
      </Suspense>
    </div>
  );
}

