import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import Image from 'next/image';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { VolleyballIcon } from '@/components/landing/VolleyballIcon';
import { CalendarDays, MapPin, Users, Trophy, Clock } from 'lucide-react';
import { buildTournamentMetadata } from '@/lib/public-tournament-metadata';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return buildTournamentMetadata(slug, 'tournament');
}

// Status display config
const STATUS_CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  DRAFT:        { label: 'Draft',             dot: 'bg-gray-400',                  text: 'text-gray-400' },
  REGISTRATION: { label: 'Registration Open', dot: 'bg-emerald-400',               text: 'text-emerald-400' },
  PREPARATION:  { label: 'Preparation',       dot: 'bg-amber-400',                 text: 'text-amber-400' },
  LIVE:         { label: 'Live',              dot: 'bg-red-500 animate-pulse',      text: 'text-red-400' },
  COMPLETED:    { label: 'Completed',         dot: 'bg-slate-400',                 text: 'text-slate-400' },
  ARCHIVED:     { label: 'Archived',          dot: 'bg-slate-600',                 text: 'text-slate-500' },
};

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
  const supabase = await createClient();

  // Validates the session so RLS accurately determines if the user is a tournament member
  await supabase.auth.getUser();

  // Reads only from tournaments table. RLS allows public to read if is_public = true.
  // Organizers can read even if is_public = false (because they pass is_tournament_member check).
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, name, slug, sport, format, league_mode, venue, description, start_date, end_date, status, tournament_branding(logo_path)')
    .eq('slug', slug)
    .single();

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#09090e] text-text-primary">
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
  const { data: settings } = await supabase
    .from('tournament_settings')
    .select('player_registration_enabled, team_registration_enabled, max_teams')
    .eq('tournament_id', tournament.id as string)
    .single();

  // Fetch approved teams from the safe public view (only ACTIVE teams in public tournaments)
  const { data: teams } = await supabase
    .from('public_team_view')
    .select('id, name, short_name')
    .eq('tournament_id', tournament.id as string);

  const isRegistrationOpen = tournament.status === 'REGISTRATION';
  const isLeague = tournament.format === 'LEAGUE';
  const playerRegEnabled = settings?.player_registration_enabled !== false;
  const teamRegEnabled = settings?.team_registration_enabled !== false;
  const statusCfg = STATUS_CONFIG[tournament.status ?? 'DRAFT'] ?? STATUS_CONFIG.DRAFT;
  const startDate = formatDate(tournament.start_date ?? null);
  const endDate = formatDate(tournament.end_date ?? null);
  const teamsCount = teams?.length ?? 0;
  const branding = Array.isArray(tournament.tournament_branding) ? tournament.tournament_branding[0] : tournament.tournament_branding;
  const logoUrl = branding?.logo_path ? supabase.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl : null;

  const showPlayerCTA = isRegistrationOpen && playerRegEnabled;
  const showTeamOwnerCTA = isRegistrationOpen && isLeague && teamRegEnabled;

  return (
    <div className="min-h-screen bg-[#09090e] text-text-primary">
      <PublicLandingNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">

        {/* Back navigation */}
        <div className="mb-8">
          <Link 
            href="/#tournaments" 
            className="inline-flex items-center text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            ← Back to Tournaments
          </Link>
        </div>

        {/* Header */}
        <div className="mb-10">
          {/* Volleyball sport badge */}
          <div className="flex items-center gap-2 mb-4">
            <VolleyballIcon className="w-5 h-5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">Volleyball</span>
          </div>

          <div className="mb-3 flex items-center gap-4">
            {logoUrl && <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"><Image src={logoUrl} alt={`${tournament.name} logo`} fill sizes="64px" className="object-contain p-2" unoptimized /></div>}
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-text-primary leading-tight">{tournament.name}</h1>
          </div>

          {/* Status + format badges */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
              aria-label={`Status: ${statusCfg.label}`}
            >
              <span className={`w-2 h-2 rounded-full ${statusCfg.dot}`} />
              <span className={statusCfg.text}>{statusCfg.label}</span>
            </span>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold text-text-secondary"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {formatFormat(tournament.format ?? '', tournament.league_mode)}
            </span>
          </div>

          {/* Description */}
          {tournament.description && (
            <p className="text-text-secondary text-base leading-relaxed max-w-2xl">
              {tournament.description}
            </p>
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {(startDate || endDate) && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <CalendarDays className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">Date</p>
                <p className="text-sm font-medium text-text-primary">
                  {startDate && endDate && startDate !== endDate
                    ? `${startDate} \u2014 ${endDate}`
                    : (startDate || endDate)}
                </p>
              </div>
            </div>
          )}

          {tournament.venue && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">Venue</p>
                <p className="text-sm font-medium text-text-primary">{tournament.venue}</p>
              </div>
            </div>
          )}

          {isLeague && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Users className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">Teams</p>
                <p className="text-sm font-medium text-text-primary">
                  {teamsCount > 0
                    ? `${teamsCount} team${teamsCount === 1 ? '' : 's'} registered`
                    : 'No teams yet'}
                </p>
              </div>
            </div>
          )}

          {!isRegistrationOpen && tournament.status !== 'COMPLETED' && tournament.status !== 'ARCHIVED' && (
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-text-muted mb-1">Status</p>
                <p className={`text-sm font-medium ${statusCfg.text}`}>{statusCfg.label}</p>
              </div>
            </div>
          )}
        </div>

        {/* Registration CTAs */}
        {(showPlayerCTA || showTeamOwnerCTA) && (
          <section className="mb-10" aria-labelledby="register-heading">
            <h2 id="register-heading" className="text-xl font-bold text-text-primary mb-4">Register Now</h2>
            <div className="flex flex-wrap gap-4">
              {showPlayerCTA && (
                <Link
                  href={`/t/${slug}/register/player`}
                  id="player-register-cta"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl font-semibold transition-colors text-sm"
                  style={{ boxShadow: '0 4px 20px rgba(79,70,229,0.3)' }}
                >
                  Register as Player
                </Link>
              )}
              {showTeamOwnerCTA && (
                <Link
                  href={`/t/${slug}/register/owner`}
                  id="team-owner-register-cta"
                  className="inline-flex items-center gap-2 px-6 py-3 border text-text-primary rounded-xl font-semibold transition-colors text-sm hover:text-text-primary"
                  style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.10)' }}
                >
                  Apply as Team Owner
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Registered Teams — only approved/active teams from public view */}
        {isLeague && teamsCount > 0 && (
          <section className="mb-10" aria-labelledby="teams-heading">
            <h2 id="teams-heading" className="text-xl font-bold text-text-primary mb-4">Registered Teams</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {teams!.map((team) => (
                <div
                  key={team.id}
                  className="p-3 rounded-xl flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-primary"
                    style={{ background: 'rgba(79,70,229,0.15)' }}>
                    {(team.short_name ?? (team.name ?? '').slice(0, 3)).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-text-primary truncate">{team.name ?? ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live/Completed — Phase 5 not yet available */}
        {(tournament.status === 'LIVE' || tournament.status === 'COMPLETED') && (
          <div
            className="rounded-xl p-6 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <Trophy className="h-8 w-8 text-text-muted mx-auto mb-3" aria-hidden="true" />
            <p className="text-text-secondary text-sm">
              Live scoring, fixtures, and standings are coming soon for this tournament.
            </p>
          </div>
        )}
      </main>

      <LandingFooter />
    </div>
  );
}
