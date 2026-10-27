import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { PlayerRegistrationForm } from './PlayerRegistrationForm';
import { FeeNotice } from '@/components/payments/FeeNotice';
import { PaymentsDue } from '@/components/payments/PaymentsDue';
import { RegistrationShell, registrationCardClass, registrationStatusClass } from '../RegistrationShell';
import type { Metadata } from 'next';
import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';

// This page reads auth session (cookies) and live tournament status.
// It must never be statically cached — force dynamic rendering on every request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return buildTournamentMetadata(slug, 'player');
}

export default async function PlayerRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Fetch Tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, status, format, league_mode')
    .eq('slug', slug)
    .single();

  if (!tournament) {
    return (
      <RegistrationShell slug={slug} title="Tournament not found">
        <p className="text-text-secondary">This tournament is unavailable or no longer public.</p>
      </RegistrationShell>
    );
  }

  if (tournament.status !== 'REGISTRATION') {
    return (
      <RegistrationShell slug={slug} tournamentName={tournament.name} title="Player Registration">
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning" role="status">
          This tournament is not currently open for registration.
        </div>
      </RegistrationShell>
    );
  }

  // 2. Enforce Authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <RegistrationShell slug={slug} tournamentName={tournament.name} title="Player Registration">
        <div className={registrationCardClass}>
          {/* Icon */}
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-text-primary">Register as a Player</h2>
          <p className="mt-2 text-sm text-text-secondary leading-relaxed">
            To register for <span className="font-semibold text-text-primary">{tournament.name}</span>, you need a free Tourny account.
            Sign in if you already have one, or create a new account — it only takes a minute.
          </p>

          {/* Primary CTA — for existing users */}
          <Link
            href={`/login?next=/t/${slug}/register/player`}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Sign in to continue
          </Link>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-text-muted">New to Tourny?</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Secondary CTA — for new users */}
          <Link
            href={`/register?next=/t/${slug}/register/player`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-muted px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Create a free account
          </Link>
        </div>
      </RegistrationShell>
    );
  }

  // 3. Fetch Player Profile
  const { data: profile } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // 4. Check existing registration
  let existingRegistration = null;
  if (profile) {
    const { data: reg } = await supabase
      .from('player_tournament_registrations')
      .select('id, status, auction_category, review_notes')
      .eq('tournament_id', tournament.id)
      .eq('player_id', profile.id)
      .single();
    
    if (reg) {
      existingRegistration = reg;
    }
  }

  return (
    <RegistrationShell slug={slug} tournamentName={tournament.name} title="Player Registration">
      <FeeNotice tournamentId={tournament.id} kind="PLAYER" />
      <PaymentsDue title="Pay your registration fee" />
      {existingRegistration ? (
        <div className={registrationCardClass}>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Registration Status</h2>
          
          <div className={`${registrationStatusClass} flex items-center justify-between gap-4`}>
            <span className="font-medium text-text-secondary">Status</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              existingRegistration.status === 'APPROVED' ? 'bg-success/10 text-success dark:bg-success/15 dark:text-success' :
              existingRegistration.status === 'REJECTED' ? 'bg-danger/10 text-danger dark:bg-danger/15 dark:text-danger' :
              existingRegistration.status === 'CHANGES_REQUESTED' ? 'bg-warning/10 text-warning dark:bg-warning/15 dark:text-warning' :
              'bg-primary/15 text-tournament-accent'
            }`}>
              {existingRegistration.status}
            </span>
          </div>

          {existingRegistration.review_notes && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <span className="font-semibold block mb-1">Organizer Notes:</span>
              {existingRegistration.review_notes}
            </div>
          )}

          {/* Kit Details Card */}
          <div className="mt-4 rounded-xl border border-border bg-surface-muted p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Registered Kit Details</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-raised p-2 border border-border/50">
                <span className="block text-xs uppercase font-semibold text-text-muted">Name</span>
                <span className="block text-sm font-bold text-text-primary uppercase truncate">{profile?.jersey_name || '—'}</span>
              </div>
              <div className="rounded-lg bg-surface-raised p-2 border border-border/50">
                <span className="block text-xs uppercase font-semibold text-text-muted">Number</span>
                <span className="block text-sm font-bold text-text-primary">{profile?.jersey_number ? `#${profile.jersey_number}` : '—'}</span>
              </div>
              <div className="rounded-lg bg-surface-raised p-2 border border-border/50">
                <span className="block text-xs uppercase font-semibold text-text-muted">Size</span>
                <span className="block text-sm font-bold text-text-primary">{profile?.jersey_size || '—'}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-text-secondary">
            <p>Your registration has been submitted.</p>
            <Link 
              href="/player/profile" 
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              Edit Kit & Profile
            </Link>
          </div>
        </div>
      ) : (
        <PlayerRegistrationForm 
          userId={user.id} 
          tournamentId={tournament.id}
          initialProfile={profile} 
        />
      )}
    </RegistrationShell>
  );
}
