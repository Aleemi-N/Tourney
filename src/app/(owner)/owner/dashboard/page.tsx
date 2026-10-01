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
            <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
                <div className="mx-auto max-w-6xl">
                    <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 shadow-[0_0_15px_rgba(var(--primary),0.2)]">
                            <Shield className="h-3.5 w-3.5 text-primary" />
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Owner overview</p>
                        </div>
                        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent">
                            Your teams, at a glance.
                        </h1>
                        <p className="mt-4 text-base leading-7 text-text-secondary">
                            Choose a team to review its squad or join a live auction with an authoritative purse snapshot.
                        </p>
                    </div>

                    <section className="mt-12">
                        <div className="flex items-center justify-between border-b border-glass-border pb-4">
                            <div className="flex items-center gap-3">
                                <Users className="h-5 w-5 text-text-muted" />
                                <h2 className="text-xl font-bold text-text-primary">Managed Teams</h2>
                            </div>
                            <span className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-bold text-primary shadow-sm">
                                {teams.length} active
                            </span>
                        </div>
                        
                        {teams.length === 0 ? (
                            <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border border-glass-border bg-surface-raised/40 p-12 text-center backdrop-blur-sm">
                                <div className="rounded-full bg-surface-muted p-4 border border-glass-border shadow-inner">
                                    <ShieldAlert className="h-8 w-8 text-text-muted opacity-50" />
                                </div>
                                <h3 className="mt-4 text-lg font-bold text-text-primary">No Active Teams</h3>
                                <p className="mt-2 max-w-sm text-sm text-text-secondary">
                                    You do not manage any active teams yet. Any applications that are approved will appear here.
                                </p>
                            </div>
                        ) : (
                            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                {teams.map((team) => (
                                    <article key={team.id} className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-glass-border bg-surface-raised/60 p-6 backdrop-blur-xl shadow-[0_4px_20px_rgb(0,0,0,0.1)] transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:border-primary/40 hover:-translate-y-1">
                                        <div className="absolute top-0 right-0 h-32 w-32 -translate-y-16 translate-x-16 rounded-full bg-primary/20 blur-[50px] transition-all group-hover:bg-primary/30" />
                                        
                                        <div className="relative z-10 flex items-start justify-between gap-3">
                                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-glass-border bg-surface shadow-inner text-lg font-black text-primary">
                                                {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                                            </div>
                                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                                <Activity className="h-3 w-3" />
                                                Active
                                            </span>
                                        </div>
                                        <h3 className="relative z-10 mt-6 truncate text-xl font-bold text-text-primary">{team.name}</h3>
                                        <p className="relative z-10 mt-1 truncate text-sm font-medium text-text-secondary">{team.tournament_name}</p>
                                        
                                        <div className="relative z-10 mt-6 grid grid-cols-2 gap-3">
                                            <div className="rounded-2xl bg-surface-muted/50 p-3 border border-glass-border">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Context</p>
                                                <p className="mt-1 truncate text-sm font-bold text-text-primary">{team.place || 'Tournament'}</p>
                                            </div>
                                            <div className="rounded-2xl bg-surface-muted/50 p-3 border border-glass-border">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Access</p>
                                                <p className="mt-1 text-sm font-bold text-text-primary">Owner</p>
                                            </div>
                                        </div>
                                        
                                        <Link href={`/owner/teams/${team.id}`} className="relative z-10 mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary-hover px-4 py-3 text-sm font-bold text-white shadow-[0_4px_15px_rgba(var(--primary),0.3)] transition-all hover:shadow-[0_6px_20px_rgba(var(--primary),0.4)] active:scale-[0.98]">
                                            Open team portal
                                            <ArrowRight className="h-4 w-4" />
                                        </Link>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    {applicationsResult.data && applicationsResult.data.length > 0 && (
                        <section className="mt-12">
                            <div className="mb-4 flex items-center gap-2 border-b border-glass-border pb-4">
                                <CheckCircle2 className="h-5 w-5 text-text-muted" />
                                <h2 className="text-lg font-bold text-text-primary">Pending Applications</h2>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {applicationsResult.data.map((application) => (
                                    <div key={application.id} className="flex flex-col justify-between rounded-2xl border border-glass-border bg-surface-raised/40 p-4 backdrop-blur-md transition-all hover:border-glass-border-strong hover:bg-surface-raised/60">
                                        <div>
                                            <p className="font-bold text-text-primary">{application.proposed_team_name}</p>
                                            <p className="mt-0.5 text-xs text-text-secondary">
                                                {Array.isArray(application.tournaments) ? application.tournaments[0]?.name : application.tournaments?.name}
                                            </p>
                                        </div>
                                        <div className="mt-4 self-start">
                                            <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                                                application.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                                application.status === 'REJECTED' ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                                                'border-orange-500/30 bg-orange-500/10 text-orange-400'
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