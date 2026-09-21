import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlayerRegistrationForm } from './PlayerRegistrationForm';
import { RegistrationShell, registrationCardClass, registrationStatusClass } from '../RegistrationShell';

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
    redirect(`/login?next=/t/${slug}/register/player`);
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
      {existingRegistration ? (
        <div className={registrationCardClass}>
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Registration Status</h2>
          
          <div className={`${registrationStatusClass} flex items-center justify-between gap-4`}>
            <span className="font-medium text-text-secondary">Status</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              existingRegistration.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              existingRegistration.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              existingRegistration.status === 'CHANGES_REQUESTED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
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

          <div className="mt-6 text-sm text-text-secondary">
            <p>Your registration has been submitted. If you need to update your profile information, please visit your <a href="/player/profile" className="font-medium text-primary hover:text-primary-hover hover:underline">Player Profile</a>.</p>
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
