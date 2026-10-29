import type { Metadata } from 'next';
import { EmbedShell } from '@/components/embed/EmbedShell';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { getCanonicalOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type Fixture = { id: string; match_number: number | null; status: string; scheduled_at: string | null; court: string | null; home_team_id: string | null; away_team_id: string | null; total_home_score: number | null; total_away_score: number | null };

/** Embeddable fixtures and results: <iframe src="/embed/t/{slug}/fixtures">. Optional ?theme=light|dark. */
export default async function EmbedFixtures({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { slug } = await params;
  const { theme } = await searchParams;
  const tournament = await getTournamentHeader(slug);
  const href = `${getCanonicalOrigin()}/t/${slug}/fixtures`;
  if (!tournament) return <EmbedShell theme={theme} title="Tournament not found" href={getCanonicalOrigin()} refreshSeconds={300}><p className="text-sm text-text-muted">This tournament is not public.</p></EmbedShell>;
  const api = await createClient();
  const { data } = await api.from('public_fixture_view')
    .select('id,match_number,status,scheduled_at,court,home_team_id,away_team_id,total_home_score,total_away_score')
    .eq('tournament_id', tournament.id).order('scheduled_at', { ascending: true, nullsFirst: false }).limit(60);
  const fixtures = (data ?? []) as Fixture[];
  const ids = [...new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is string => Boolean(id)))];
  const { data: teams } = ids.length ? await api.from('public_team_view').select('id,name').in('id', ids) : { data: [] };
  const names = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const live = fixtures.filter((f) => f.status === 'LIVE');
  const upcoming = fixtures.filter((f) => f.status !== 'LIVE' && f.status !== 'COMPLETED');
  const done = fixtures.filter((f) => f.status === 'COMPLETED').slice(-6).reverse();
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : 'Time to be announced');
  const row = (f: Fixture, showScore: boolean) => (
    <li key={f.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{names.get(f.home_team_id ?? '') ?? 'TBD'} <span className="font-normal text-text-muted">vs</span> {names.get(f.away_team_id ?? '') ?? 'TBD'}</p>
        <p className="text-xs text-text-muted">{f.status === 'LIVE' ? 'Live now' : when(f.scheduled_at)}{f.court ? ` · Court ${f.court}` : ''}</p>
      </div>
      {showScore ? <span className="shrink-0 text-base font-extrabold tabular-nums text-primary">{f.total_home_score ?? 0} – {f.total_away_score ?? 0}</span> : null}
    </li>
  );

  return (
    <EmbedShell theme={theme} title={tournament.name} subtitle="Fixtures and results" href={href} refreshSeconds={30}>
      {fixtures.length === 0 ? <p className="text-sm text-text-muted">Fixtures will appear here.</p> : (
        <div className="space-y-4">
          {live.length > 0 ? <section><h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-live">Live</h2><ul>{live.map((f) => row(f, true))}</ul></section> : null}
          {upcoming.length > 0 ? <section><h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">Upcoming</h2><ul>{upcoming.slice(0, 10).map((f) => row(f, false))}</ul></section> : null}
          {done.length > 0 ? <section><h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">Results</h2><ul>{done.map((f) => row(f, true))}</ul></section> : null}
        </div>
      )}
    </EmbedShell>
  );
}
