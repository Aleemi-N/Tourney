import { getTournament } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { Suspense } from 'react';

import { RegistrationLinks } from './RegistrationLinks';
import { RegistrationStatusControl } from './RegistrationStatusControl';
import { TournamentStatsServer } from './TournamentStatsServer';
import { OrganizerLinkPending } from '@/components/organizer/OrganizerLinkPending';
import { TournamentApprovalStatus } from '@/components/organizer/TournamentApprovalStatus';
import { createClient } from '@/lib/supabase/server';
import type { ApprovalStatus } from '@/lib/super-admin-types';

export const dynamic = 'force-dynamic';

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-surface-muted p-4 rounded-xl border border-border h-24" />
      ))}
    </div>
  );
}

async function TournamentOverviewContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Use cached tournament lookup (shared with layout)
  const { data: tournament } = await getTournament(id);

  if (!tournament) {
    notFound();
  }

  const supabase = await createClient();
  const { data: branding } = await supabase.from('tournament_branding').select('logo_path').eq('tournament_id', id).maybeSingle();
  const logoUrl = branding?.logo_path ? supabase.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl : null;

  // Approval fields — with safe fallback for pre-migration rows
  const t = tournament as Record<string, unknown>;
  const approvalStatus: ApprovalStatus = (t.approval_status as ApprovalStatus) ?? 'APPROVED';
  const approvalSubmittedAt: string | null = (t.approval_submitted_at as string | null) ?? null;
  const rejectionReason: string | null = (t.approval_rejection_reason as string | null) ?? null;
  const hasBeenSubmitted = approvalSubmittedAt !== null;

  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto h-full">
      <Link href="/organizer/dashboard" className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-primary transition-colors mb-6">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Dashboard <OrganizerLinkPending />
      </Link>

      <div className="bg-surface rounded-2xl border border-border p-8">
        <div className="flex justify-between items-start mb-4">
          <div className="flex min-w-0 items-center gap-4">
            {logoUrl && <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-background"><Image src={logoUrl} alt="" fill sizes="56px" className="object-contain p-1.5" unoptimized /></div>}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-text-primary tracking-tight">{tournament.name as string}</h1>
              <p className="text-text-secondary">/{tournament.slug as string}</p>
            </div>
          </div>
          <span className="px-3 py-1 bg-primary/10 text-primary font-bold tracking-wider text-xs uppercase rounded">
            {tournament.status as string}
          </span>
        </div>

        {/* Approval Status Widget */}
        <div className="mb-6">
          <TournamentApprovalStatus
            tournamentId={id}
            approvalStatus={approvalStatus}
            approvalSubmittedAt={approvalSubmittedAt}
            rejectionReason={rejectionReason}
            hasBeenSubmitted={hasBeenSubmitted}
          />
        </div>

        <p className="text-text-secondary mb-8">
          Manage your tournament settings, participants, and live action from this dashboard.
        </p>

        <Suspense fallback={<StatsSkeleton />}>
          <TournamentStatsServer tournamentId={id} />
        </Suspense>
      </div>

      <RegistrationLinks
        slug={tournament.slug as string}
        tournamentName={tournament.name as string}
        isLeague={tournament.format === 'LEAGUE'}
        status={tournament.status as string}
      />

      <RegistrationStatusControl
        tournamentId={id}
        status={tournament.status as string}
      />

      {tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION' && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-text-primary mb-4">Live Operations</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href={`/organizer/tournaments/${id}/lot`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="text-2xl">🎴</span>
              <h3 className="font-semibold text-text-primary">Lot Draw</h3>
              <p className="text-sm text-text-secondary">Run Icon and Setter Lot Draw sessions.</p>
            </Link>
            <Link
              href={`/organizer/tournaments/${id}/auction`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="text-2xl">🔨</span>
              <h3 className="font-semibold text-text-primary">Auction Control</h3>
              <p className="text-sm text-text-secondary">Prepare and run the live player auction.</p>
            </Link>
            <Link
              href={`/organizer/tournaments/${id}/fixtures`}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="text-2xl">📅</span>
              <h3 className="font-semibold text-text-primary">Fixtures & Scorers</h3>
              <p className="text-sm text-text-secondary">Generate the schedule and assign authorized scorers.</p>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TournamentManagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<TournamentOverviewSkeleton />}>
      <TournamentOverviewContent params={params} />
    </Suspense>
  );
}

function TournamentOverviewSkeleton() {
  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto" aria-label="Loading tournament overview">
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-36 rounded bg-surface-muted" />
        <div className="rounded-2xl border border-border bg-surface p-5 md:p-8">
          <div className="h-9 w-64 max-w-full rounded-lg bg-surface-muted" />
          <div className="mt-3 h-4 w-40 rounded bg-surface-muted" />
          <div className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-surface-muted p-4 rounded-xl border border-border h-24" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
