import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';
import { StaffServer } from './StaffServer';

export const dynamic = 'force-dynamic';

function StaffSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 animate-pulse" aria-label="Loading tournament staff">
      {[1, 2].map((item) => <div key={item} className="h-44 rounded-2xl border border-border bg-surface" />)}
    </div>
  );
}

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl p-4 md:p-8">
      <Link href={`/organizer/tournaments/${id}`} className="inline-flex items-center text-sm font-medium text-text-secondary hover:text-primary">
        <ArrowLeftIcon className="mr-1 h-4 w-4" /> Back to Overview <OrganizerLinkPending className="ml-2" />
      </Link>
      <Suspense fallback={<StaffSkeleton />}>
        <StaffServer tournamentId={id} />
      </Suspense>
    </main>
  );
}
