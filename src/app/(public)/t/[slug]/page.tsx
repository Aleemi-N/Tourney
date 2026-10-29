import type { Metadata } from 'next';
import { createClient } from '@/lib/api/server';
import Link from 'next/link';
import Image from 'next/image';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { VolleyballIcon } from '@/components/landing/VolleyballIcon';
import { BarChart2, CalendarDays, ChevronRight, List, MapPin, Radio, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { teamColorStyle } from '@/lib/utils';
import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';
import { SponsorsSection, WatchLive } from '@/components/public/PublicExtras';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildTournamentMetadata(slug, 'tournament');
}

function formatDate(d: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatFormat(format: string, leagueMode: string | null): string {
  if (format === 'LEAGUE') {
    if (leagueMode === 'AUCTION') return 'League \u2014 Auction';
    if (leagueMode === 'REGISTERED_TEAM') return 'League \u2014 Registered Teams';
    return 'League';
  }
  return 'Knockout';
}

/**
 * Public tournament home page.
 * Reads only from public_tournament_view and public_team_view (both enforce is_public = true).
 * Pending/rejected participant data is never exposed here.
 * No Phase 5 features (lot/auction/scoring/fixtures/standings).
 */
export default async function TournamentPublicPage({ params }: Props) {
  const { slug } = await params;
  const api = await createClient();

  // Validates the session so RLS accurately determines if the user is a tournament member
  await api.auth.getUser();

  // Reads only from tournaments table. RLS allows public to read if is_public = true.
  // Organizers can read even if is_public = false (because they pass is_tournament_member check).
  const { data: tournament } = await api
    .from('tournaments')
    .select('id, name, slug, sport, format, league_mode, venue, description, start_date, end_date, status, tournament_branding(logo_path)')
    .eq('slug', slug)
    .single();

  if (!tournament) {
    return (
      <div className="min-h-screen bg-background text-text-primary">
        <PublicLandingNav />
        <main className="max-w-3xl mx-auto px-4 py-24 text-center">
          <Trophy className="mx-auto h-12 w-12 text-text-muted mb-4" />
          <h1 className="text-2xl font-bold text-text-primary mb-2">Tournament Not Found</h1>
          <p className="text-text-secondary mb-8">
            This tournament page is private, does not exist, or has not been published yet.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary-hover transition-colors text-sm"
          >
            Back to Tourny
          </Link>
        </main>
        <LandingFooter />
      </div>
    );
  }

  // Fetch settings — tournament_settings has a public read policy for public tournaments
  const { data: settings } = await api
    .from('tournament_settings')
    .select('player_registration_enabled, team_registration_enabled, max_teams')
    .eq('tournament_id', tournament.id as string)
    .single();

  // Fetch approved teams from the safe public view (only ACTIVE teams in public tournaments)
  const { data: teams } = await api
    .from('public_team_view')
    .select('id, name, short_name, primary_color')
    .eq('tournament_id', tournament.id as string);

  const isRegistrationOpen = tournament.status === 'REGISTRATION';
  const isLeague = tournament.format === 'LEAGUE';
  const playerRegEnabled = settings?.player_registration_enabled !== false;
  const teamRegEnabled = settings?.team_registration_enabled !== false;
  const startDate = formatDate(tournament.start_date ?? null);
  const endDate = formatDate(tournament.end_date ?? null);
  const teamsCount = teams?.length ?? 0;
  const branding = Array.isArray(tournament.tournament_branding) ? tournament.tournament_branding[0] : tournament.tournament_branding;
  const logoUrl = branding?.logo_path ? api.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl : null;

  const showPlayerCTA = isRegistrationOpen && playerRegEnabled;
  const showTeamOwnerCTA = isRegistrationOpen && isLeague && teamRegEnabled;

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <PublicLandingNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">

        {/* Back navigation */}
        <div className="mb-6">
          <Link 
            href="/#tournaments" 
            className="inline-flex items-center text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back to Tournaments
          </Link>
        </div>

        {/* Header */}
        <header className="mb-8 space-y-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
            <VolleyballIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            Volleyball
          </p>
          <div className="flex items-center gap-4">
            {logoUrl && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface sm:h-20 sm:w-20">
                <Image src={logoUrl} alt={`${tournament.name} logo`} fill sizes="(max-width: 640px) 64px, 80px" className="object-contain p-2" unoptimized />
              </div>
            )}
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-text-primary sm:text-5xl">{tournament.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={tournament.status ?? 'DRAFT'} />
            <StatusPill tone="neutral">{formatFormat(tournament.format ?? '', tournament.league_mode)}</StatusPill>
          </div>
          {tournament.description && (
            <p className="max-w-2xl text-base leading-relaxed text-text-secondary">{tournament.description}</p>
          )}
          <WatchLive slug={slug} />
        </header>

        {/* Key facts */}
        {(startDate || endDate || tournament.venue || isLeague) && (
          <dl className={`${cardClasses} mb-8 divide-y divide-border`}>
            {(startDate || endDate) && (
              <InfoRow icon={CalendarDays} label="Dates">
                {startDate && endDate && startDate !== endDate ? `${startDate} – ${endDate}` : (startDate || endDate)}
              </InfoRow>
            )}
            {tournament.venue && <InfoRow icon={MapPin} label="Venue">{tournament.venue}</InfoRow>}
            {isLeague && (
              <InfoRow icon={Users} label="Teams">
                {teamsCount > 0 ? `${teamsCount} team${teamsCount === 1 ? '' : 's'} registered` : 'No teams yet'}
              </InfoRow>
            )}
          </dl>
        )}

        {/* Registration CTAs */}
        {(showPlayerCTA || showTeamOwnerCTA) && (
          <section className="mb-8 flex flex-col gap-3 sm:flex-row" aria-label="Register">
            {showPlayerCTA && (
              <Link href={`/t/${slug}/register/player`} id="player-register-cta" className={buttonClasses({ size: 'lg', className: 'sm:min-w-56' })}>
                Register as player
              </Link>
            )}
            {showTeamOwnerCTA && (
              <Link href={`/t/${slug}/register/owner`} id="team-owner-register-cta" className={buttonClasses({ variant: 'secondary', size: 'lg', className: 'sm:min-w-56' })}>
                Apply as team owner
              </Link>
            )}
          </section>
        )}

        {/* Live hub */}
        <Link
          href={`/t/${slug}/live`}
          className="mb-10 flex items-center gap-4 rounded-2xl border border-live/25 bg-live/10 p-4 text-live transition-colors hover:bg-live/15 sm:p-5"
        >
          <Radio className={`h-6 w-6 shrink-0 ${tournament.status === 'LIVE' ? 'animate-pulse' : ''}`} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold">{tournament.status === 'LIVE' ? 'Live now' : 'Live hub'}</span>
            <span className="mt-0.5 block text-sm text-text-secondary">Matches, auction and lot draw as they happen</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </Link>

        {/* Registered teams — only approved/active teams from the public view */}
        {isLeague && teamsCount > 0 && (
          <section className="mb-10" aria-labelledby="teams-heading">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="teams-heading" className="text-lg font-bold text-text-primary">Teams</h2>
              <Link href={`/t/${slug}/teams`} className="text-sm font-semibold text-primary hover:underline">See all</Link>
            </div>
            <ul role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {teams!.map((team) => (
                <li key={team.id} className={`${cardClasses} flex items-center gap-3 p-3`}>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary"
                    style={teamColorStyle(team.primary_color)}
                  >
                    {(team.short_name ?? (team.name ?? '').slice(0, 3)).toUpperCase()}
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">{team.name ?? ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Explore */}
        <section aria-labelledby="explore-heading">
          <h2 id="explore-heading" className="mb-3 text-lg font-bold text-text-primary">Explore</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: 'Fixtures', path: 'fixtures', icon: CalendarDays, desc: 'Upcoming matches' },
              { label: 'Results', path: 'results', icon: List, desc: 'Completed scores' },
              { label: 'Table', path: 'table', icon: BarChart2, desc: 'League standings' },
              { label: 'Teams', path: 'teams', icon: Users, desc: 'All teams' },
              { label: 'Players', path: 'players', icon: UserRound, desc: 'Player roster' },
            ].map(({ label, path, icon: Icon, desc }) => (
              <Link
                key={path}
                href={`/t/${slug}/${path}`}
                className={`${cardClasses} flex flex-col gap-3 p-4 transition-colors hover:border-primary/40`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-base font-bold text-text-primary">{label}</span>
                  <span className="mt-0.5 block text-sm text-text-muted">{desc}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
        <SponsorsSection slug={slug} />
      </main>

      <LandingFooter />
    </div>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-text-muted">{label}</dt>
        <dd className="text-sm font-semibold text-text-primary">{children}</dd>
      </div>
    </div>
  );
}
