import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { Shield, Users, ArrowRight, Activity, Plus, FileText, ChevronRight } from 'lucide-react';

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
            <div className="relative min-h-full px-5 py-8 sm:px-8 lg:px-12 lg:py-16">
                
                {/* 🌟 Subtle Premium Background Textures 🌟 */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none mix-blend-overlay opacity-50" />
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1000px] h-[400px] opacity-20 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/30 to-transparent blur-[100px] rounded-full" />
                </div>
                
                <div className="relative z-10 mx-auto max-w-6xl">
                    <header className="mb-16">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 shadow-sm backdrop-blur-md mb-6">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-neutral-300">Owner Portal Active</p>
                        </div>
                        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl text-white">
                            Your teams, <span className="text-neutral-500">at a glance.</span>
                        </h1>
                        <p className="mt-4 text-lg text-neutral-400 max-w-2xl font-medium">
                            Manage your franchise, monitor live auctions, and track squad progress from your authoritative command center.
                        </p>
                    </header>

                    <section className="mb-20">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                    <Users className="h-5 w-5 text-neutral-300" />
                                </div>
                                <h2 className="text-2xl font-semibold text-white tracking-tight">Active Franchises</h2>
                            </div>
                            <span className="inline-flex items-center justify-center rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs font-semibold text-neutral-300">
                                {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
                            </span>
                        </div>
                        
                        {teams.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-16 text-center">
                                <div className="rounded-2xl bg-white/5 p-4 border border-white/10 mb-6">
                                    <Shield className="h-8 w-8 text-neutral-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-white mb-2">No Active Teams</h3>
                                <p className="max-w-md text-sm text-neutral-400 mb-8">
                                    You don't have any active teams yet. When an organizer approves your application, it will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {teams.map((team) => (
                                    <article key={team.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/20 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                                        
                                        <div className="flex items-start justify-between gap-3 mb-6">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent text-xl font-black text-white shadow-inner">
                                                {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                                                <Activity className="h-3 w-3" />
                                                Active
                                            </span>
                                        </div>
                                        
                                        <h3 className="truncate text-xl font-semibold text-white mb-1 group-hover:text-primary-100 transition-colors">{team.name}</h3>
                                        <p className="truncate text-sm font-medium text-neutral-400">{team.tournament_name}</p>
                                        
                                        <div className="mt-8 mb-6 grid grid-cols-2 gap-3">
                                            <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Context</p>
                                                <p className="truncate text-sm font-medium text-neutral-200">{team.place || 'Tournament'}</p>
                                            </div>
                                            <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Role</p>
                                                <p className="text-sm font-medium text-neutral-200">Owner</p>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-auto pt-4 border-t border-white/10">
                                            <Link href={`/owner/teams/${team.id}`} className="flex items-center justify-between w-full text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">
                                                <span>Open Team Portal</span>
                                                <div className="p-1.5 rounded-md bg-white/5 group-hover:bg-primary group-hover:text-white transition-colors">
                                                    <ArrowRight className="h-4 w-4" />
                                                </div>
                                            </Link>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {applicationsResult.data && applicationsResult.data.length > 0 && (
                        <section>
                            <div className="flex items-center gap-3 border-b border-white/10 pb-6 mb-8">
                                <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                    <FileText className="h-5 w-5 text-neutral-300" />
                                </div>
                                <h2 className="text-2xl font-semibold text-white tracking-tight">Pending Applications</h2>
                            </div>
                            
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {applicationsResult.data.map((application) => (
                                    <div key={application.id} className="group flex flex-col justify-between rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-all hover:bg-white/[0.04]">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <p className="text-base font-semibold text-white">{application.proposed_team_name}</p>
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                                    application.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                                    application.status === 'REJECTED' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                                                    'border-orange-500/30 bg-orange-500/10 text-orange-400'
                                                }`}>
                                                    {application.status}
                                                </span>
                                            </div>
                                            <p className="text-xs font-medium text-neutral-400">
                                                {Array.isArray(application.tournaments) ? application.tournaments[0]?.name : application.tournaments?.name}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </OwnerPortalShell>
    );
}