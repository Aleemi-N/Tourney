import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PlayerRegistrationForm } from './PlayerRegistrationForm';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

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
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tournament not found</h1>
      </main>
    );
  }

  if (tournament.status !== 'REGISTRATION') {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{tournament.name}</h1>
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
          This tournament is not currently open for registration.
        </div>
      </main>
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
    <main className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto min-h-screen">
      <div className="mb-8">
        <Link 
          href={`/t/${slug}`}
          className="inline-flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors mb-6"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back to Tournament
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{tournament.name}</h1>
        <p className="text-slate-500 mt-1">Player Registration</p>
      </div>

      {existingRegistration ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Registration Status</h2>
          
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="font-medium text-slate-700 dark:text-slate-300">Status</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              existingRegistration.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              existingRegistration.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              existingRegistration.status === 'CHANGES_REQUESTED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
              'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {existingRegistration.status}
            </span>
          </div>

          {existingRegistration.review_notes && (
            <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 text-sm">
              <span className="font-semibold block mb-1">Organizer Notes:</span>
              {existingRegistration.review_notes}
            </div>
          )}

          <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            <p>Your registration has been submitted. If you need to update your profile information, please visit your <a href="/player/profile" className="text-emerald-600 dark:text-emerald-500 hover:underline">Player Profile</a>.</p>
          </div>
        </div>
      ) : (
        <PlayerRegistrationForm 
          userId={user.id} 
          tournamentId={tournament.id}
          initialProfile={profile} 
        />
      )}
    </main>
  );
}
