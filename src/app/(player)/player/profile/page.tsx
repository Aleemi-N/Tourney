/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/api/server';
import { redirect } from 'next/navigation';
import { ProfileForm } from './ProfileForm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const registrationStatusStyles: Record<string, string> = {
  APPROVED: 'border-success/30 bg-success/10 text-success',
  PENDING: 'border-warning/30 bg-warning/10 text-warning',
  REJECTED: 'border-danger/30 bg-danger/10 text-danger',
  CHANGES_REQUESTED: 'border-warning/30 bg-warning/10 text-warning',
  WITHDRAWN: 'border-border-strong bg-surface-muted text-text-secondary',
};

export default async function PlayerProfilePage() {
  const api = await createClient();
  const { data: { user } } = await api.auth.getUser();

  if (!user) {
    redirect('/login?next=/player/profile');
  }

  // Fetch existing profile
  const { data: profile } = await api
    .from('player_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch registrations
  const { data: registrations } = await api
    .from('player_tournament_registrations')
    .select(`
      id,
      status,
      tournament_id,
      tournaments!inner (
        name,
        slug
      )
    `)
    .eq('player_id', profile?.id || '00000000-0000-0000-0000-000000000000');

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 pb-12 pt-5 sm:px-6 sm:pt-8 md:px-8">
      <Link
        href="/"
        className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Tourny
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Player Profile</h1>
      
      <ProfileForm userId={user.id} initialProfile={profile} />

      {profile && (
        <section className="mt-8 sm:mt-10">
          <h2 className="mb-4 text-xl font-semibold text-text-primary">My Registrations</h2>
          {(!registrations || registrations.length === 0) ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-5 text-sm text-text-secondary">
              You haven&apos;t registered for any tournaments yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {registrations.map((reg: any) => (
                <div key={reg.id} className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface-raised p-4 shadow-sm min-[360px]:flex-row min-[360px]:items-center min-[360px]:justify-between">
                  <div className="min-w-0 break-words font-medium text-text-primary">
                    {reg.tournaments.name}
                  </div>
                  <div className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase ${registrationStatusStyles[reg.status] || 'border-border-strong bg-surface-muted text-text-secondary'}`}>
                    {reg.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
