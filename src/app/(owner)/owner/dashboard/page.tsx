/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Image from 'next/image';
import { ArrowRightOnRectangleIcon, TrophyIcon, UsersIcon } from '@heroicons/react/24/outline';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';

export default async function OwnerDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch approved teams via team_owners
  const { data: teamOwners } = await supabase
    .from('team_owners')
    .select(`
      is_primary,
      teams (
        id,
        name,
        short_name,
        logo_path,
        place,
        tournaments (
          name
        )
      )
    `)
    .eq('user_id', user.id);

  // Fetch pending applications
  const { data: applications } = await supabase
    .from('team_owner_applications')
    .select(`
      id,
      proposed_team_name,
      status,
      tournaments (
        name
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['PENDING', 'CHANGES_REQUESTED', 'REJECTED']);

  const activeTeams = teamOwners?.map(to => to.teams).filter(Boolean) || [];

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex w-64 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen sticky top-0">
        <div className="flex h-16 shrink-0 items-center px-6">
          <span className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tourny Owner</span>
        </div>
        
        <nav className="flex flex-1 flex-col px-4 py-4 overflow-y-auto">
          <ul role="list" className="flex flex-1 flex-col gap-y-2">
            <li>
              <ul role="list" className="space-y-1">
                <li>
                  <Link href="/owner/dashboard" className="group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                    <TrophyIcon className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    Dashboard
                  </Link>
                </li>
                {/* Placeholders */}
                <li>
                  <span className="group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-medium text-slate-400 dark:text-slate-600 cursor-not-allowed">
                    <UsersIcon className="h-6 w-6 shrink-0 text-slate-300 dark:text-slate-700" aria-hidden="true" />
                    Squad (Coming Soon)
                  </span>
                </li>
              </ul>
            </li>
            <li className="mt-auto">
              <form action={logout}>
                <button
                  type="submit"
                  className="group flex w-full gap-x-3 rounded-md p-2 text-sm leading-6 font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="h-6 w-6 shrink-0 text-slate-400 group-hover:text-red-600" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </li>
          </ul>
        </nav>
      </div>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto pb-20 md:pb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-8">Owner Dashboard</h1>

        <div className="flex flex-col gap-8">
          {/* Approved Teams Section */}
          <section>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">My Teams</h2>
            
            {activeTeams.length === 0 ? (
              <p className="text-sm text-slate-500 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
                You do not manage any active teams yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {activeTeams.map((team: any) => (
                  <div key={team.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
                    <div className="h-24 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center border-b border-slate-200 dark:border-slate-800">
                      {team.logo_path ? (
                        <Image src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${team.logo_path}`} alt="Team Logo" fill className="object-contain p-2" unoptimized />
                      ) : (
                        <div className="text-slate-400 dark:text-slate-600 font-bold text-2xl">{team.short_name || 'TEAM'}</div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 truncate">{team.name}</h3>
                      <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span className="truncate">{team.tournaments?.name}</span>
                        {team.place && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">{team.place}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending Applications Section */}
          {applications && applications.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-4">Pending Applications</h2>
              <div className="flex flex-col gap-3">
                {applications.map((app: any) => (
                  <div key={app.id} className="flex justify-between items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-lg shadow-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{app.proposed_team_name}</span>
                      <span className="text-xs text-slate-500">{app.tournaments?.name}</span>
                    </div>
                    <div className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                      app.status === 'REJECTED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      app.status === 'CHANGES_REQUESTED' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {app.status}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
