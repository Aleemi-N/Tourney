import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TournamentDiscoveryCard, type DiscoveryTournamentProps } from '@/components/landing/TournamentDiscoveryCard';
import { createClient } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Find a Tournament',
  description: 'Search volleyball tournaments by name or city, and filter by status and date.',
};
export const dynamic = 'force-dynamic';

const STATUSES = [
  ['ALL', 'All'], ['LIVE', 'Live now'], ['REGISTRATION', 'Open for registration'], ['UPCOMING', 'Upcoming'], ['COMPLETED', 'Finished'],
] as const;
const WHEN = [['ANY', 'Any time'], ['WEEK', 'This week'], ['MONTH', 'This month'], ['PAST', 'Past']] as const;

type Params = { q?: string; status?: string; when?: string };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function TournamentsDirectory({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const params: Params = { q: one(raw.q).slice(0, 80), status: one(raw.status) || 'ALL', when: one(raw.when) || 'ANY' };
  const api = await createClient();

  let query = api
    .from('tournaments')
    .select('id, slug, name, status, start_date, end_date, venue, format, league_mode, tournament_branding (logo_path), tournament_settings (player_registration_enabled, team_registration_enabled)')
    .eq('is_public', true)
    .in('status', ['REGISTRATION', 'PREPARATION', 'LIVE', 'COMPLETED'])
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(60);

  // Characters that have a meaning inside a PostgREST filter are dropped from the search text.
  const text = (params.q ?? '').replace(/[%*,()\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) query = query.or(`name.ilike.*${text}*,venue.ilike.*${text}*`);
  const today = new Date();
  if (params.status === 'UPCOMING') query = query.gte('start_date', ymd(today));
  else if (['LIVE', 'REGISTRATION', 'COMPLETED'].includes(params.status ?? '')) query = query.eq('status', params.status!);
  if (params.when === 'WEEK') query = query.lte('start_date', ymd(new Date(today.getTime() + 7 * 86400000))).gte('end_date', ymd(today));
  else if (params.when === 'MONTH') query = query.lte('start_date', ymd(new Date(today.getFullYear(), today.getMonth() + 1, 0))).gte('end_date', ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
  else if (params.when === 'PAST') query = query.lt('end_date', ymd(today));

  const { data: tournaments } = await query;
  const filtered = Boolean(text) || params.status !== 'ALL' || params.when !== 'ANY';

  const select = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';
  return (
    <div className="dark min-h-screen bg-background text-text-primary selection:bg-primary/30 selection:text-text-primary">
      <PublicLandingNav />
      <main className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Browse</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Find a tournament</h1>
        <p className="mt-2 text-text-secondary">Search by name or city, then filter by status and date.</p>

        <form method="get" action="/tournaments" role="search" className="mt-8 grid gap-4 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end sm:p-6">
          <label className="text-sm font-medium text-text-secondary">
            Search
            <input name="q" type="search" defaultValue={params.q} placeholder="Name or city" maxLength={80} className={`mt-1.5 ${select}`} />
          </label>
          <label className="text-sm font-medium text-text-secondary">
            Status
            <select name="status" defaultValue={params.status} className={`mt-1.5 ${select}`}>
              {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-text-secondary">
            When
            <select name="when" defaultValue={params.when} className={`mt-1.5 ${select}`}>
              {WHEN.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex gap-2">
            <button type="submit" className="min-h-11 flex-1 rounded-xl bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary-hover">Search</button>
            {filtered ? <Link href="/tournaments" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-semibold text-text-secondary hover:bg-surface-muted">Clear</Link> : null}
          </div>
        </form>

        <p className="mt-6 text-sm text-text-muted" role="status">{tournaments?.length ?? 0} tournament{tournaments?.length === 1 ? '' : 's'}{filtered ? ' match' : ''}</p>

        {!tournaments || tournaments.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-border bg-surface px-6 py-16 text-center">
            <h2 className="text-lg font-bold">{filtered ? 'No tournaments match.' : 'No tournaments right now.'}</h2>
            <p className="mt-1 text-sm text-text-secondary">{filtered ? 'Try a different search or filter.' : 'Check back soon.'}</p>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => <TournamentDiscoveryCard key={t.id} tournament={t as unknown as DiscoveryTournamentProps['tournament']} />)}
          </div>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
