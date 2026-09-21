import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { TeamOwnerRegistrationForm } from '@/app/(public)/t/[slug]/register/team/TeamOwnerRegistrationForm';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

export default async function TeamOwnerRegistrationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  // 1. Fetch Tournament
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, status, format')
    .eq('slug', slug)
    .single();

  if (!tournament) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Tournament not found</h1>
      </main>
    );
  }

  if (tournament.status !== 'REGISTRATION' || tournament.format !== 'LEAGUE') {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{tournament.name}</h1>
        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
          This tournament is not currently accepting team owner applications.
        </div>
      </main>
    );
  }

  // 2. Enforce Authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=/t/${slug}/register/team`);
  }

  // 3. Check existing application
  const { data: application } = await supabase
    .from('team_owner_applications')
    .select('id, status, review_notes')
    .eq('tournament_id', tournament.id)
    .eq('user_id', user.id)
    .single();

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
        <p className="text-slate-500 mt-1">Team Owner Application</p>
      </div>

      {application ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Application Status</h2>
          
          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
            <span className="font-medium text-slate-700 dark:text-slate-300">Status</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              application.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
              application.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
              application.status === 'CHANGES_REQUESTED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
              'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}>
              {application.status}
            </span>
          </div>

          {application.review_notes && (
            <div className="mt-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 text-sm">
              <span className="font-semibold block mb-1">Organizer Notes:</span>
              {application.review_notes}
            </div>
          )}

          <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">
            <p>Your team application has been submitted and is currently being reviewed by the organizer.</p>
          </div>
        </div>
      ) : (
        <TeamOwnerRegistrationForm 
          userId={user.id} 
          tournamentId={tournament.id}
          tournamentSlug={slug}
        />
      )}
    </main>
  );
}
