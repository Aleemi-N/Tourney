/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { ArrowLeft } from 'lucide-react';
import { AccountAvatar } from '@/components/profile/AccountAvatar';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';
import Image from 'next/image';
import { CalendarDays, MapPin } from 'lucide-react';
import { VolleyballIcon } from '@/components/landing/VolleyballIcon';

export const metadata = { title: 'My Profile' };
export const dynamic = 'force-dynamic';

const playerStatusPresentation: Record<string, { label: string; description: string; className: string }> = {
  PENDING: {
    label: 'Registration Pending',
    description: 'Your registration has been submitted and is awaiting organizer review.',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  APPROVED: {
    label: 'Approved',
    description: 'Your player registration has been approved.',
    className: 'border-success/30 bg-success/10 text-success',
  },
  REJECTED: {
    label: 'Registration Rejected',
    description: 'Your player registration was not approved for this tournament.',
    className: 'border-danger/30 bg-danger/10 text-danger',
  },
  CHANGES_REQUESTED: {
    label: 'Changes Requested',
    description: 'The organizer requested changes. Review your registration and player profile.',
    className: 'border-warning/40 bg-warning/10 text-warning',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    description: 'This player registration has been withdrawn.',
    className: 'border-border-strong bg-surface-muted text-text-secondary',
  },
};

function formatTournamentDate(startDate?: string | null, endDate?: string | null) {
  if (!startDate) return null;
  const start = new Date(startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!endDate || endDate === startDate) return start;
  return `${start} – ${new Date(endDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/profile');
  }

  // Fetch basic user data (we use auth user metadata or profile if available)
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const fullName = profile?.full_name || user.user_metadata?.full_name || 'Tourny User';
  const email = user.email;

  // Derive "Tournaments Participated"
  // 1. Organizer relationships
  const { data: organizerMemberships } = await supabase
    .from('tournament_members')
    .select(`
      tournament_id,
      tournaments!inner (id, name, slug, status, format, start_date, end_date, venue, tournament_branding (logo_path))
    `)
    .eq('user_id', user.id)
    .eq('role', 'ORGANIZER')
    .eq('status', 'ACTIVE');

  // 2. Player relationships
  // player_tournament_registrations requires player_id. We fetch player_profile first
  const { data: playerProfile } = await supabase
    .from('player_profiles')
    .select('id, photo_path')
    .eq('user_id', user.id)
    .single();

  let playerRegistrations: any[] = [];
  if (playerProfile) {
    const { data } = await supabase
      .from('player_tournament_registrations')
      .select(`
        tournament_id,
        status,
        auction_category,
        tournaments!inner (id, name, slug, status, format, start_date, end_date, venue, tournament_branding (logo_path))
      `)
      .eq('player_id', playerProfile.id);
    playerRegistrations = data || [];
  }

  // 3. Team Owner relationships. Active assignments are authoritative; an
  // approved application alone does not grant access to an owner team.
  const { data: ownerTeams } = await supabase
    .from('team_owners')
    .select(`
      team_id,
      teams!inner (
        id,
        tournament_id,
        tournaments!inner (id, name, slug, status, format, start_date, end_date, venue, tournament_branding (logo_path))
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'ACTIVE');

  // Merge distinct tournaments
  const participationMap = new Map<string, any>();

  organizerMemberships?.forEach((m: any) => {
    if (m.tournaments) {
      participationMap.set(m.tournament_id, {
        tournament: m.tournaments,
        roles: ['Organizer'],
        playerRegistration: null,
      });
    }
  });

  playerRegistrations?.forEach((r: any) => {
    if (r.tournaments) {
      const existing = participationMap.get(r.tournament_id);
      if (existing) {
        if (!existing.roles.includes('Player')) existing.roles.push('Player');
        existing.playerRegistration = { status: r.status, auctionCategory: r.auction_category };
      } else {
        participationMap.set(r.tournament_id, {
          tournament: r.tournaments,
          roles: ['Player'],
          playerRegistration: { status: r.status, auctionCategory: r.auction_category },
        });
      }
    }
  });

  ownerTeams?.forEach((assignment: any) => {
    const team = assignment.teams;
    if (team?.tournaments) {
      const existing = participationMap.get(team.tournament_id);
      if (existing) {
        if (!existing.roles.includes('Team Owner')) existing.roles.push('Team Owner');
        existing.ownerTeamIds = [...(existing.ownerTeamIds ?? []), assignment.team_id];
      } else {
        participationMap.set(team.tournament_id, {
          tournament: team.tournaments,
          roles: ['Team Owner'],
          ownerTeamIds: [assignment.team_id],
        });
      }
    }
  });

  // 4. Global Organizer Status
  const [{ data: organizerAccessMemberships }, { data: createdTournament }] = await Promise.all([
    supabase
    .from('tournament_members')
    .select('tournament_id')
    .eq('user_id', user.id)
    .eq('role', 'ORGANIZER')
    .eq('status', 'ACTIVE')
    .limit(1),
    supabase.from('tournaments').select('id').eq('created_by', user.id).limit(1).maybeSingle(),
  ]);
  const isGlobalOrganizer = Boolean(organizerAccessMemberships?.length || createdTournament);
  const { data: scorerAccess } = await supabase
    .from('tournament_members')
    .select('tournament_id')
    .eq('user_id', user.id)
    .eq('role', 'SCORER')
    .eq('status', 'ACTIVE')
    .limit(1);

  const participations = Array.from(participationMap.values());
  const accountPhotoUrl = resolvePublicStorageUrl(
    supabase,
    'avatars',
    playerProfile?.photo_path || profile?.avatar_path,
  );

  return (
    <div className="min-h-screen bg-background">
      <LandingNav isAuthenticated={true} isOrganizer={isGlobalOrganizer} userProfile={{ full_name: fullName, photo_url: accountPhotoUrl }} />
      <main className="mx-auto max-w-4xl px-4 pb-12 pt-6 sm:px-8 sm:pt-10">
        <Link
          href="/"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Tourny
        </Link>
        <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Identity Section */}
        <div className="w-full rounded-3xl border border-glass-border bg-surface-raised p-6 sm:p-8 shadow-card dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] relative overflow-hidden md:w-1/3 group">
          <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="flex flex-col items-center text-center gap-4 relative z-10">
            <AccountAvatar name={fullName} photoUrl={accountPhotoUrl} />
            <div>
              <h1 className="break-words text-2xl font-bold tracking-tight text-text-primary">{fullName}</h1>
              <p className="mt-1 break-all text-sm text-text-secondary">{email}</p>
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-border flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">Account Actions</h2>
            <Link 
              href="/player/profile"
              className="text-primary hover:text-primary-hover font-medium text-sm transition-colors"
            >
              Update Volleyball Profile &rarr;
            </Link>
            {isGlobalOrganizer && (
              <Link href="/organizer/dashboard" className="text-primary hover:text-primary-hover font-medium text-sm transition-colors">
                Go to Organizer Dashboard &rarr;
              </Link>
            )}
            {ownerTeams && ownerTeams.length > 0 && (
              <Link href="/owner/dashboard" className="text-primary hover:text-primary-hover font-medium text-sm transition-colors">
                Go to Team Portal &rarr;
              </Link>
            )}
            {scorerAccess?.length ? (
              <Link href="/scorer" className="text-primary hover:text-primary-hover font-medium text-sm transition-colors">
                Open Scorer Workspace &rarr;
              </Link>
            ) : null}
          </div>
        </div>

        {/* Contextual tournament relationships */}
        <div id="my-tournaments" className="relative w-full scroll-mt-24 md:w-2/3">
          <span id="tournament-history" className="absolute -top-24" aria-hidden="true" />
          <h2 className="text-2xl font-extrabold text-primary tracking-tight">My Tournaments</h2>
          <p className="mb-8 mt-2 text-sm text-text-secondary">Your player registrations, organizer access, and team-owner relationships.</p>
          
          {participations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-raised p-6 text-center sm:p-8">
              <p className="text-text-secondary mb-4">You don&apos;t have any player, organizer, or team-owner relationships yet.</p>
              <Link
                href="/#tournaments"
                className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors"
              >
                Find a Tournament
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {participations.map((p, idx) => {
                const playerStatus = p.playerRegistration ? playerStatusPresentation[p.playerRegistration.status] : null;
                const branding = Array.isArray(p.tournament.tournament_branding) ? p.tournament.tournament_branding[0] : p.tournament.tournament_branding;
                const logoUrl = resolvePublicStorageUrl(supabase, 'logos', branding?.logo_path);
                const date = formatTournamentDate(p.tournament.start_date, p.tournament.end_date);
                return (
                <article key={p.tournament.id || idx} className="overflow-hidden rounded-3xl border border-glass-border bg-surface-raised transition-all duration-500 hover:border-primary/50 dark:hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] group relative">
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="flex min-w-0 gap-4 p-5 sm:gap-5 sm:p-6 relative z-10">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-muted sm:h-16 sm:w-16">
                      {logoUrl ? <Image src={logoUrl} alt="" fill sizes="64px" className="object-contain p-1.5" /> : <VolleyballIcon className="h-7 w-7 text-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
                        <h3 className="break-words text-lg font-semibold text-text-primary">{p.tournament.name}</h3>
                        <span className="shrink-0 rounded bg-surface-muted px-2 py-1 text-xs font-bold uppercase tracking-wider text-text-secondary">{p.tournament.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">{p.tournament.format?.replaceAll('_', ' ')}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                        {date && <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{date}</span>}
                        {p.tournament.venue && <span className="flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.tournament.venue}</span></span>}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap gap-2">
                    {p.roles.map((role: string) => (
                      <span key={role} className="px-2.5 py-1 text-xs font-semibold rounded bg-primary/10 text-primary">
                        {role}
                      </span>
                    ))}
                    </div>
                    {playerStatus && (
                      <div className={`mt-3 rounded-lg border p-3 ${playerStatus.className}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-bold">{playerStatus.label}</span>
                          {p.playerRegistration.status === 'APPROVED' && p.playerRegistration.auctionCategory && (
                            <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold dark:bg-surface-muted">Classification: {p.playerRegistration.auctionCategory.replaceAll('_', ' ')}</span>
                          )}
                        </div>
                        <p className="mt-1 text-xs opacity-90">{playerStatus.description}</p>
                      </div>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3 relative z-10">
                      <Link href={`/t/${p.tournament.slug}`} className="relative z-10 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:shadow-primary/30 transition-all duration-300 active:scale-95">View Tournament</Link>
                      {p.playerRegistration && <Link href="/player/profile" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-glass-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-all duration-300 active:scale-95">View / Edit Profile</Link>}
                      {p.roles.includes('Organizer') && <Link href={`/organizer/tournaments/${p.tournament.id}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-glass-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-all duration-300 active:scale-95">Open Dashboard</Link>}
                      {p.ownerTeamIds?.length > 0 && <Link href={p.ownerTeamIds.length === 1 ? `/owner/teams/${p.ownerTeamIds[0]}` : '/owner/dashboard'} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-glass-border bg-surface px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-surface-muted hover:text-text-primary transition-all duration-300 active:scale-95">Open Team Portal</Link>}
                    </div>
                  </div>
                </article>
              )})}
            </div>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
