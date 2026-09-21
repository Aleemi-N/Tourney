/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LandingNav } from '@/components/landing/LandingNav';
import { ArrowLeft } from 'lucide-react';
import { AccountAvatar } from '@/components/profile/AccountAvatar';
import { resolvePublicStorageUrl } from '@/lib/supabase/storage-url';

export const metadata = { title: 'My Profile' };
export const dynamic = 'force-dynamic';

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
      tournaments!inner (id, name, slug, status, format)
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
        tournaments!inner (id, name, slug, status, format)
      `)
      .eq('player_id', playerProfile.id)
      .eq('status', 'APPROVED');
    playerRegistrations = data || [];
  }

  // 3. Team Owner relationships
  const { data: ownerApplications } = await supabase
    .from('team_owner_applications')
    .select(`
      tournament_id,
      status,
      tournaments!inner (id, name, slug, status, format)
    `)
    .eq('user_id', user.id)
    .eq('status', 'APPROVED');

  // Merge distinct tournaments
  const participationMap = new Map<string, any>();

  organizerMemberships?.forEach((m: any) => {
    if (m.tournaments) {
      participationMap.set(m.tournament_id, {
        tournament: m.tournaments,
        roles: ['Organizer']
      });
    }
  });

  playerRegistrations?.forEach((r: any) => {
    if (r.tournaments) {
      const existing = participationMap.get(r.tournament_id);
      if (existing) {
        if (!existing.roles.includes('Player')) existing.roles.push('Player');
      } else {
        participationMap.set(r.tournament_id, {
          tournament: r.tournaments,
          roles: ['Player']
        });
      }
    }
  });

  ownerApplications?.forEach((a: any) => {
    if (a.tournaments) {
      const existing = participationMap.get(a.tournament_id);
      if (existing) {
        if (!existing.roles.includes('Team Owner')) existing.roles.push('Team Owner');
      } else {
        participationMap.set(a.tournament_id, {
          tournament: a.tournaments,
          roles: ['Team Owner']
        });
      }
    }
  });

  // 4. Global Organizer Status
  const { data: orgs } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1);
  const isGlobalOrganizer = !!(orgs && orgs.length > 0);

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
        <div className="w-full rounded-2xl border border-border bg-surface-raised p-5 shadow-lg shadow-black/10 sm:p-6 md:w-1/3">
          <div className="flex flex-col items-center text-center gap-4">
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
            <Link 
              href="/organizer/dashboard"
              className="text-primary hover:text-primary-hover font-medium text-sm transition-colors"
            >
              Go to Organizer Dashboard &rarr;
            </Link>
          </div>
        </div>

        {/* Participation History */}
        <div id="tournament-history" className="w-full scroll-mt-24 md:w-2/3">
          <h2 className="text-xl font-bold text-text-primary mb-6">Tournament History</h2>
          
          {participations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-raised p-6 text-center sm:p-8">
              <p className="text-text-secondary mb-4">You haven&apos;t participated in any tournaments yet.</p>
              <Link
                href="/#tournaments"
                className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary-hover transition-colors"
              >
                Find a Tournament
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {participations.map((p, idx) => (
                <div key={p.tournament.id || idx} className="rounded-xl border border-border bg-surface-raised p-4 transition-colors hover:border-border-strong sm:p-5">
                  <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
                    <Link href={`/t/${p.tournament.slug}`} className="font-semibold text-lg text-text-primary hover:text-primary transition-colors">
                      {p.tournament.name}
                    </Link>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 bg-surface-muted text-text-secondary rounded">
                      {p.tournament.status}
                    </span>
                  </div>
                  
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {p.roles.map((role: string) => (
                      <span key={role} className="px-2.5 py-1 text-xs font-semibold rounded bg-primary/10 text-primary">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
