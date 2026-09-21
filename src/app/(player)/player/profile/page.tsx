/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ProfileForm } from './ProfileForm';

export default async function PlayerProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/player/profile');
  }

  // Fetch existing profile
  const { data: profile } = await supabase
    .from('player_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch registrations
  const { data: registrations } = await supabase
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
    <main className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-slate-900 dark:text-slate-100">Player Profile</h1>
      
      <ProfileForm userId={user.id} initialProfile={profile} />

      {profile && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-100">My Registrations</h2>
          {(!registrations || registrations.length === 0) ? (
            <p className="text-slate-500 text-sm">You haven&apos;t registered for any tournaments yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {registrations.map((reg: any) => (
                <div key={reg.id} className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {reg.tournaments.name}
                  </div>
                  <div className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
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
