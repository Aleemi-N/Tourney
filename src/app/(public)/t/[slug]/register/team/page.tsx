import { createClient } from '@/lib/api/server';
import Link from 'next/link';
import { TeamOwnerRegistrationForm } from '@/app/(public)/t/[slug]/register/team/TeamOwnerRegistrationForm';
import { FeeNotice } from '@/components/payments/FeeNotice';
import { RegistrationNotice } from '@/components/registration/RegistrationNotice';
import { PaymentsDue } from '@/components/payments/PaymentsDue';
import { RegistrationShell, registrationCardClass, registrationStatusClass } from '../RegistrationShell';
import type { Metadata } from 'next';
import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return buildTournamentMetadata(slug, 'owner');
}

export default async function TeamOwnerRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const api = await createClient();

  // 1. Fetch Tournament
  const { data: tournament } = await api
    .from('tournaments')
    .select('id, name, status, format')
    .eq('slug', slug)
    .single();

  if (!tournament) {
    return (
      <RegistrationShell slug={slug} title="Tournament not found">
        <p className="text-text-secondary">This tournament is unavailable or no longer public.</p>
      </RegistrationShell>
    );
  }

  if (tournament.status !== 'REGISTRATION' || tournament.format !== 'LEAGUE') {
    return (
      <RegistrationShell slug={slug} tournamentName={tournament.name} title="Team Owner Registration">
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning" role="status">
          This tournament is not currently accepting team owner applications.
        </div>
      </RegistrationShell>
    );
  }

  // 2. Enforce Authentication
  const { data: { user } } = await api.auth.getUser();
  if (!user) {
    return (
      <RegistrationShell slug={slug} tournamentName={tournament.name} title="Team Owner Registration">
        <div className={registrationCardClass}>
          <h2 className="text-lg font-semibold text-text-primary">Sign in required</h2>
          <p className="mt-2 text-sm text-text-secondary">Sign in to your Tourny account to apply as a team owner.</p>
          <Link href={`/login?next=/t/${slug}/register/team`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            Sign in to continue
          </Link>
        </div>
      </RegistrationShell>
    );
  }

  // 3. Check existing application
  const { data: application } = await api
    .from('team_owner_applications')
    .select('id, status, review_notes')
    .eq('tournament_id', tournament.id)
    .eq('user_id', user.id)
    .single();

  // Teams this user already runs elsewhere can be reused, unless already in this tournament.
  const { data: ownedProfiles } = await api
    .from('team_profiles')
    .select('id, name, short_name, logo_path, place, primary_color, secondary_color')
    .eq('owner_user_id', user.id)
    .order('name');
  const { data: enteredTeams } = await api.from('teams').select('team_profile_id').eq('tournament_id', tournament.id);
  const entered = new Set((enteredTeams ?? []).map((team) => team.team_profile_id));
  const profiles = (ownedProfiles ?? []).filter((profile) => !entered.has(profile.id));

  return (
    <RegistrationShell slug={slug} tournamentName={tournament.name} title="Team Owner Registration">
      <RegistrationNotice tournamentId={tournament.id} kind="TEAM" />
      <FeeNotice tournamentId={tournament.id} kind="TEAM" />
      <PaymentsDue title="Pay your registration fee" />
      {application ? (
        <div className={registrationCardClass}>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Application Status</h2>

          <div className={`${registrationStatusClass} flex items-center justify-between gap-4`}>
            <span className="font-medium text-text-secondary">Status</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${application.status === 'APPROVED' ? 'bg-success/10 text-success dark:bg-success/15 dark:text-success' :
                application.status === 'REJECTED' ? 'bg-danger/10 text-danger dark:bg-danger/15 dark:text-danger' :
                  application.status === 'CHANGES_REQUESTED' ? 'bg-warning/10 text-warning dark:bg-warning/15 dark:text-warning' :
                    'bg-primary/15 text-tournament-accent'
              }`}>
              {application.status}
            </span>
          </div>

          {application.review_notes && (
            <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
              <span className="font-semibold block mb-1">Organizer Notes:</span>
              {application.review_notes}
            </div>
          )}

          <div className="mt-6 text-sm text-text-secondary">
            <p>Your team application has been submitted and is currently being reviewed by the organizer.</p>
          </div>
        </div>
      ) : (
        <TeamOwnerRegistrationForm
          userId={user.id}
          tournamentId={tournament.id}
          profiles={profiles}
        />
      )}
    </RegistrationShell>
  );
}
