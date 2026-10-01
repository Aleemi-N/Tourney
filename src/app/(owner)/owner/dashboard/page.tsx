import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { Shield, Users, ArrowRight, Activity, FileText, Globe, Trophy, Wallet, UserCircle, Rocket } from 'lucide-react';

export const metadata: Metadata = { title: 'Team Owner Dashboard' };

export default async function OwnerDashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const [teams, applicationsResult, activeTournamentsResult] = await Promise.all([
        getOwnerTeams(supabase, user.id),
        supabase.from('team_owner_applications').select('id, proposed_team_name, status, tournaments(name)').eq('user_id', user.id).in('status', ['PENDING', 'CHANGES_REQUESTED', 'REJECTED']),
        supabase.from('tournaments')
            .select('id, name, format, status')
            .in('status', ['DRAFT', 'REGISTRATION_OPEN', 'PUBLISHED', 'LIVE'])
            .order('created_at', { ascending: false })
            .limit(6),
    ]);

    return (
        <OwnerPortalShell teams={teams}>
            <div className="relative min-h-full px-5 py-8 sm:px-8 lg:px-12 lg:py-16">
                
                {/* 🌟 Subtle Premium Background Textures 🌟 */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none mix-blend-overlay opacity-50" />
                <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[1000px] h-[400px] opacity-20 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/30 to-transparent blur-[100px] rounded-full" />
                </div>
                
                <div className="relative z-10 mx-auto max-w-7xl">
                    <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 shadow-sm backdrop-blur-md mb-6">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                </span>
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-100">Owner Portal</p>
                            </div>
                            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl text-white">
                                Welcome back.
                            </h1>
                            <p className="mt-4 text-lg text-neutral-400 font-medium">
                                Manage your franchise, monitor live auctions, and track squad progress.
                            </p>
                        </div>
                    </header>

                    <div className="grid lg:grid-cols-3 gap-8">
                        
                        {/* Left Column: Active Teams & Pending Apps */}
                        <div className="lg:col-span-2 space-y-12">
                            {/* ACTIVE FRANCHISES */}
                            <section>
                                <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-primary/20 border border-primary/30">
                                            <Shield className="h-5 w-5 text-primary-100" />
                                        </div>
                                        <h2 className="text-2xl font-semibold text-white tracking-tight">Active Franchises</h2>
                                    </div>
                                </div>
                                
                                {teams.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-12 text-center">
                                        <div className="rounded-2xl bg-white/5 p-4 border border-white/10 mb-6">
                                            <Shield className="h-8 w-8 text-neutral-400" />
                                        </div>
                                        <h3 className="text-xl font-semibold text-white mb-2">No Active Teams</h3>
                                        <p className="max-w-md text-sm text-neutral-400">
                                            You don't have any active teams yet. Find a tournament to join or wait for your pending applications to be approved.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid gap-6 md:grid-cols-2">
                                        {teams.map((team) => (
                                            <article key={team.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all duration-500 hover:bg-white/[0.05] hover:border-primary/50 hover:shadow-[0_8px_30px_rgba(var(--primary),0.2)]">
                                                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                
                                                <div className="relative z-10 flex items-start justify-between gap-3 mb-6">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent text-xl font-black text-white shadow-inner group-hover:border-primary/40 group-hover:text-primary-100 transition-colors">
                                                        {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                                                    </div>
                                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                                        <Activity className="h-3 w-3" />
                                                        Active
                                                    </span>
                                                </div>
                                                
                                                <h3 className="relative z-10 truncate text-xl font-semibold text-white mb-1 group-hover:text-primary-100 transition-colors">{team.name}</h3>
                                                <p className="relative z-10 truncate text-sm font-medium text-neutral-400">{team.tournament_name}</p>
                                                
                                                <div className="relative z-10 mt-8 mb-6 grid grid-cols-2 gap-3">
                                                    <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Context</p>
                                                        <p className="truncate text-sm font-medium text-neutral-200">{team.place || 'Tournament'}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">Role</p>
                                                        <p className="text-sm font-medium text-neutral-200">Owner</p>
                                                    </div>
                                                </div>
                                                
                                                <div className="relative z-10 mt-auto pt-4 border-t border-white/10">
                                                    <Link href={`/owner/teams/${team.id}`} className="flex items-center justify-between w-full text-sm font-semibold text-neutral-300 group-hover:text-white transition-colors">
                                                        <span>Open Team Portal</span>
                                                        <div className="p-1.5 rounded-md bg-white/5 group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                                                            <ArrowRight className="h-4 w-4" />
                                                        </div>
                                                    </Link>
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>

                            {/* PENDING APPLICATIONS */}
                            {applicationsResult.data && applicationsResult.data.length > 0 && (
                                <section>
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
                                        <div className="p-2 rounded-lg bg-white/5 border border-white/10">
                                            <FileText className="h-5 w-5 text-neutral-300" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-white tracking-tight">Pending Applications</h2>
                                    </div>
                                    
                                    <div className="grid gap-4 sm:grid-cols-2">
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

                        {/* Right Column: Discover Tournaments */}
                        <div className="lg:col-span-1">
                            <section className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-6 shadow-2xl sticky top-24">
                                <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
                                    <div className="p-2 rounded-lg bg-fuchsia-500/20 border border-fuchsia-500/30">
                                        <Globe className="h-5 w-5 text-fuchsia-300" />
                                    </div>
                                    <h2 className="text-xl font-semibold text-white tracking-tight">Discover Tournaments</h2>
                                </div>

                                {activeTournamentsResult.data && activeTournamentsResult.data.length > 0 ? (
                                    <div className="space-y-4">
                                        {activeTournamentsResult.data.map((tournament) => (
                                            <div key={tournament.id} className="group flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:bg-white/[0.05] hover:border-fuchsia-500/30">
                                                <h3 className="text-base font-semibold text-white mb-1 group-hover:text-fuchsia-300 transition-colors">{tournament.name}</h3>
                                                <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-4">
                                                    <span className="capitalize">{tournament.format.toLowerCase()}</span>
                                                    <span className="h-1 w-1 rounded-full bg-neutral-600"></span>
                                                    <span className="text-fuchsia-400/80">{tournament.status.replace('_', ' ')}</span>
                                                </div>
                                                <Link href={`/t/${tournament.id}`} className="flex items-center justify-center gap-2 w-full rounded-lg bg-white/10 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20">
                                                    View Details
                                                    <Rocket className="h-4 w-4" />
                                                </Link>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center">
                                        <p className="text-sm text-neutral-400">No active tournaments available for registration right now.</p>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>

                </div>
            </div>
        </OwnerPortalShell>
    );
}