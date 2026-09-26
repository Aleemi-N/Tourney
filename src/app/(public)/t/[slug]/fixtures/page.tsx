import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import { MapPin, Clock, ExternalLink, Tv } from 'lucide-react';


type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'fixtures');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Fixtures';
  const description = meta.description ?? 'Upcoming and scheduled matches.';
  const canonical = new URL(`/t/${slug}/fixtures`, TOURNY_PRODUCTION_ORIGIN);
  return {
    ...meta,
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      ...meta.openGraph,
      title: { absolute: title },
      description,
      url: canonical,
      siteName: 'Tourny',
    },
  };
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  SCHEDULED: { label: 'Scheduled', color: '#a5b4fc', bg: 'rgba(99,102,241,0.12)' },
  LIVE: { label: 'Live', color: '#f87171', bg: 'rgba(239,68,68,0.12)' },
  COMPLETED: { label: 'Completed', color: '#4ade80', bg: 'rgba(34,197,94,0.12)' },
  POSTPONED: { label: 'Postponed', color: '#fbbf24', bg: 'rgba(245,158,11,0.12)' },
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default async function PublicFixturesPage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();

  const { data: fixtureRows } = await supabase
    .from('public_fixture_view')
    .select('id,match_number,round_number,bracket_position,program_order,bracket_match_type,scheduled_at,venue,court,status,home_team_id,away_team_id')
    .eq('tournament_id', tournament.id)
    .neq('status', 'COMPLETED')
    .order('round_number', { ascending: true, nullsFirst: false })
    .order('program_order', { ascending: true });

  const fixtures = fixtureRows ?? [];

  const teamIds = [...new Set(
    (fixtures ?? []).flatMap((f) => [f.home_team_id, f.away_team_id]).filter(Boolean)
  )];
  const { data: teams } = teamIds.length
    ? await supabase.from('public_team_view').select('id,name,short_name').in('id', teamIds)
    : { data: [] };

  const teamName = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? 'TBD';
  const teamShort = (id: string | null) => teams?.find((t) => t.id === id)?.short_name ?? null;
  const fixturesByRound = new Map<number, NonNullable<typeof fixtures>>();
  for (const fixture of fixtures ?? []) {
    const round = fixture.round_number ?? 0;
    fixturesByRound.set(round, [...(fixturesByRound.get(round) ?? []), fixture]);
  }
  const rounds = [...fixturesByRound.entries()].sort(([a], [b]) => a - b);

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'rgba(165,180,252,0.7)' }}>Schedule</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Fixtures</h1>
      </div>

      {(!fixtures || fixtures.length === 0) ? (
        <EmptyState text="Fixtures will appear once the organizer generates the schedule." />
      ) : (
        <div className="space-y-8">
          {rounds.map(([round, roundFixtures]) => (
            <section key={round} aria-labelledby={`round-${round}`}>
              <h2 id={`round-${round}`} className="mb-3 text-lg font-bold text-text-primary">
                {Number(round) > 0 ? `Round ${round}` : 'Fixtures'}
              </h2>
              <div className="space-y-3">
                {roundFixtures.map((fixture) => {
                  const statusCfg = STATUS_STYLE[fixture.status ?? 'SCHEDULED'] ?? STATUS_STYLE.SCHEDULED;
                  const home = teamName(fixture.home_team_id);
                  const away = teamName(fixture.away_team_id);
                  const homeShort = teamShort(fixture.home_team_id) ?? home.slice(0, 3).toUpperCase();
                  const awayShort = teamShort(fixture.away_team_id) ?? away.slice(0, 3).toUpperCase();
                  const isLiveMatch = fixture.status === 'LIVE';

                  return (
                    <article
                      key={fixture.id}
                      className="rounded-2xl p-5 transition-colors"
                      style={{
                        background: isLiveMatch ? 'rgba(239,68,68,0.07)' : 'rgba(255,255,255,0.025)',
                        border: isLiveMatch ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        {/* Match label + status */}
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            #{fixture.program_order} · Match {fixture.match_number ?? '—'} · {(fixture.bracket_match_type ?? 'STANDARD').replace('_', ' ')}
                          </p>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-bold"
                            style={{ background: statusCfg.bg, color: statusCfg.color }}
                          >
                            {statusCfg.label}
                          </span>
                        </div>

                        {/* Date/time */}
                        {fixture.scheduled_at && (
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            <Clock className="h-3.5 w-3.5" />
                            <span>{fmtDate(fixture.scheduled_at)} · {fmtTime(fixture.scheduled_at)}</span>
                          </div>
                        )}
                      </div>

                      {/* Teams */}
                      <div className="mt-4 flex items-center gap-3">
                        {/* Home */}
                        <div className="flex flex-1 items-center gap-2.5">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                            style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                          >
                            {homeShort.slice(0, 3)}
                          </div>
                          <span className="font-bold text-sm leading-tight">{home}</span>
                        </div>

                        <span className="text-xs font-bold px-2" style={{ color: 'rgba(255,255,255,0.25)' }}>vs</span>

                        {/* Away */}
                        <div className="flex flex-1 flex-row-reverse items-center gap-2.5">
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black"
                            style={{ background: 'rgba(168,85,247,0.15)', color: '#c4b5fd' }}
                          >
                            {awayShort.slice(0, 3)}
                          </div>
                          <span className="font-bold text-sm leading-tight text-right">{away}</span>
                        </div>
                      </div>

                      {/* Venue */}
                      {(fixture.venue || fixture.court) && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <MapPin className="h-3.5 w-3.5" />
                          <span>{[fixture.venue, fixture.court].filter(Boolean).join(' · ')}</span>
                        </div>
                      )}

                      {fixture.home_team_id && fixture.away_team_id && (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
                          <Link href={`/t/${slug}/match/${fixture.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold hover:bg-white/[0.1]">
                            <ExternalLink className="h-3.5 w-3.5" /> Match view
                          </Link>
                          <Link href={`/t/${slug}/match/${fixture.id}/tv`} className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-xs font-semibold hover:bg-white/[0.1]">
                            <Tv className="h-3.5 w-3.5" /> TV scoreboard
                          </Link>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PublicTournamentFrame>
  );
}
