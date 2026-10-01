import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerTeams } from '@/lib/owner/owner-team';
import { OwnerPortalShell } from '@/components/owner/OwnerPortalShell';
import { Shield, Users, ArrowRight, ShieldAlert, Activity, CheckCircle2 } from 'lucide-react';

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
            <div className="relative min-h-full px-5 py-8 sm:px-8 lg:px-12 lg:py-12 overflow-hidden">
                {/* 🌟 Dynamic Background Glows for Glassmorphism 🌟 */}
                <div className="absolute top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-primary/30 blur-[120px] pointer-events-none mix-blend-screen" />
                <div className="absolute bottom-[-10%] right-[-10%] h-[600px] w-[600px] rounded-full bg-fuchsia-600/20 blur-[150px] pointer-events-none mix-blend-screen" />
                <div className="absolute top-[40%] left-[60%] h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none mix-blend-screen" />
                
                <div className="relative z-10 mx-auto max-w-6xl">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/20 px-3 py-1 shadow-[0_0_20px_rgba(var(--primary),0.4)] backdrop-blur-md">
                            <Shield className="h-4 w-4 text-primary drop-shadow-md" />
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-white">Owner overview</p>
                        </div>
                        <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-6xl bg-gradient-to-br from-white via-primary-100 to-primary/50 bg-clip-text text-transparent drop-shadow-sm">
                            Your teams, at a glance.
                        </h1>
                        <p className="mt-4 text-lg leading-8 text-text-secondary">
                            Choose a team to review its squad or join a live auction with an authoritative purse snapshot.
                        </p>
                    </div>

                    <section className="mt-16">
                        <div className="flex items-center justify-between border-b border-glass-border pb-4">
                            <div className="flex items-center gap-3">
                                <Users className="h-6 w-6 text-primary drop-shadow-md" />
                                <h2 className="text-2xl font-black text-white">Managed Teams</h2>
                            </div>
                            <span className="rounded-xl border border-primary/40 bg-primary/20 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]">
                                {teams.length} active
                            </span>
                        </div>
                        
                        {teams.length === 0 ? (
                            <div className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-glass-border bg-surface-raised/60 p-16 text-center backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] relative overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                                <div className="rounded-full bg-surface-muted/80 p-6 border border-glass-border shadow-inner backdrop-blur-md relative">
                                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
                                    <ShieldAlert className="relative h-10 w-10 text-primary drop-shadow-md" />
                                </div>
                                <h3 className="mt-6 text-2xl font-black text-white">No Active Teams</h3>
                                <p className="mt-3 max-w-md text-base text-text-secondary">
                                    You do not manage any active teams yet. Any applications that are approved will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                                {teams.map((team) => (
                                    <article key={team.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-glass-border bg-surface-raised/70 p-7 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] transition-all duration-500 hover:shadow-[0_16px_48px_rgba(var(--primary),0.2)] hover:border-primary/50 hover:-translate-y-1.5">
                                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/30 blur-[60px] transition-all duration-500 group-hover:bg-primary/50 group-hover:scale-150" />
                                        
                                        <div className="relative z-10 flex items-start justify-between gap-3">
                                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-surface to-surface-muted shadow-inner text-2xl font-black text-white group-hover:text-primary transition-colors">
                                                {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                                            </div>
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                                <Activity className="h-3.5 w-3.5" />
                                                Active
                                            </span>
                                        </div>
                                        <h3 className="relative z-10 mt-6 truncate text-2xl font-black text-white group-hover:text-primary-100 transition-colors">{team.name}</h3>
                                        <p className="relative z-10 mt-1.5 truncate text-sm font-bold text-primary/80 uppercase tracking-wider">{team.tournament_name}</p>
                                        
                                        <div className="relative z-10 mt-8 grid grid-cols-2 gap-4">
                                            <div className="rounded-2xl bg-black/30 p-4 border border-white/5 shadow-inner">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Context</p>
                                                <p className="mt-1.5 truncate text-sm font-bold text-white">{team.place || 'Tournament'}</p>
                                            </div>
                                            <div className="rounded-2xl bg-black/30 p-4 border border-white/5 shadow-inner">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-text-muted">Access</p>
                                                <p className="mt-1.5 text-sm font-bold text-white">Owner</p>
                                            </div>
                                        </div>
                                        
                                        <Link href={`/owner/teams/${team.id}`} className="relative z-10 mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-fuchsia-600 px-5 py-4 text-sm font-black uppercase tracking-wider text-white shadow-[0_4px_20px_rgba(var(--primary),0.4)] transition-all duration-300 hover:shadow-[0_8px_30px_rgba(var(--primary),0.6)] hover:scale-[1.02] active:scale-[0.98]">
                                            Open team portal
                                            <ArrowRight className="h-5 w-5" />
                                        </Link>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {applicationsResult.data && applicationsResult.data.length > 0 && (
                        <section className="mt-16">
                            <div className="mb-6 flex items-center gap-3 border-b border-glass-border pb-4">
                                <CheckCircle2 className="h-6 w-6 text-fuchsia-400 drop-shadow-md" />
                                <h2 className="text-2xl font-black text-white">Pending Applications</h2>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {applicationsResult.data.map((application) => (
                                    <div key={application.id} className="group flex flex-col justify-between rounded-3xl border border-glass-border bg-surface-raised/60 p-6 backdrop-blur-xl shadow-lg transition-all duration-300 hover:border-fuchsia-500/30 hover:bg-surface-raised/80 hover:-translate-y-1">
                                        <div>
                                            <p className="text-lg font-black text-white">{application.proposed_team_name}</p>
                                            <p className="mt-1 text-sm font-bold text-primary/70 uppercase tracking-wider">
                                                {Array.isArray(application.tournaments) ? application.tournaments[0]?.name : application.tournaments?.name}
                                            </p>
                                        </div>
                                        <div className="mt-6 self-start">
                                            <span className={`inline-flex rounded-xl border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest shadow-sm ${
                                                application.status === 'PENDING' ? 'border-amber-500/40 bg-amber-500/20 text-amber-300' :
                                                application.status === 'REJECTED' ? 'border-red-500/40 bg-red-500/20 text-red-300' :
                                                'border-orange-500/40 bg-orange-500/20 text-orange-300'
                                            }`}>
                                                {application.status}
                                            </span>
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