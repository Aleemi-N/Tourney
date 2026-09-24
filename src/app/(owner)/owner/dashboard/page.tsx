import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';

export const metadata: Metadata = { title: 'Team Owner Dashboard' };

export default async function OwnerDashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const [teams, applicationsResult] = await Promise.all([
        getOwnerTeams(supabase, user.id),
        supabase.from('team_owner_applications').select('id, proposed_team_name, status, tournaments(name)').eq('user_id', user.id).in('status', ['PENDING', 'CHANGES_REQUESTED', 'REJECTED']),
    ]);

    return (
        <OwnerPortalShell teams={teams}>
            <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
                <div className="mx-auto max-w-6xl">
                    <div className="max-w-2xl">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Owner overview</p>
                        <h1 className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">Your teams, at a glance.</h1>
                        <p className="mt-4 text-base leading-7 text-white/55">Choose a team to review its squad or join a live auction with an authoritative purse snapshot.</p>
                    </div>

                    <section className="mt-10">
                        <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Managed teams</p><h2 className="mt-2 text-2xl font-black text-white">Select a team</h2></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-white/45">{teams.length} active</span></div>
                        {teams.length === 0 ? (
                            <div className="mt-5 rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-sm text-white/55">You do not manage an active team yet.</div>
                        ) : (
                            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                {teams.map((team) => (
                                    <article key={team.id} className="flex min-w-0 flex-col rounded-3xl border border-white/10 bg-[#17132a] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
                                        <div className="flex items-start justify-between gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-fuchsia-300/10 text-sm font-black text-fuchsia-100">{(team.short_name || team.name).slice(0, 3).toUpperCase()}</div><span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-100">Active</span></div>
                                        <h3 className="mt-7 truncate text-xl font-black text-white">{team.name}</h3>
                                        <p className="mt-1 truncate text-sm text-white/45">{team.tournament_name}</p>
                                        <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-white/40">Context</p><p className="mt-1 truncate text-sm font-semibold text-white">{team.place || 'Tournament team'}</p></div><div className="rounded-2xl bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-white/40">Access</p><p className="mt-1 text-sm font-semibold text-white">Owner</p></div></div>
                                        <Link href={`/owner/teams/${team.id}`} className="mt-5 rounded-2xl border border-fuchsia-200/20 px-4 py-3 text-center text-sm font-bold text-fuchsia-100 transition hover:bg-fuchsia-300/10">Open team</Link>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {applicationsResult.data && applicationsResult.data.length > 0 ? <section className="mt-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Applications</p><div className="mt-4 space-y-3">{applicationsResult.data.map((application) => <div key={application.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/3 px-4 py-4"><div><p className="font-semibold text-white">{application.proposed_team_name}</p><p className="text-sm text-white/45">{Array.isArray(application.tournaments) ? application.tournaments[0]?.name : application.tournaments?.name}</p></div><span className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white/55">{application.status}</span></div>)}</div></section> : null}
                </div>
            </div>
        </OwnerPortalShell>
    );
}