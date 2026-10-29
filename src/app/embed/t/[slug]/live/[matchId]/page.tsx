import type { Metadata } from 'next';
import { EmbedShell } from '@/components/embed/EmbedShell';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { getCanonicalOrigin } from '@/lib/origin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type State = {
  match: { id: string; status: string; match_number: number | null; court: string | null; winner_team_id?: string | null };
  home_team: { id: string; name: string }; away_team: { id: string; name: string };
  sets: { set_number: number; status: string; home_score: number; away_score: number; target_points: number; winner_team_id: string | null }[];
};

/** Embeddable live score of one match: <iframe src="/embed/t/{slug}/live/{matchId}">. Optional ?theme=light|dark. */
export default async function EmbedLive({ params, searchParams }: { params: Promise<{ slug: string; matchId: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { slug, matchId } = await params;
  const { theme } = await searchParams;
  const tournament = await getTournamentHeader(slug);
  const href = `${getCanonicalOrigin()}/t/${slug}/match/${matchId}`;
  const unavailable = (text: string) => <EmbedShell theme={theme} title="Live score" href={getCanonicalOrigin()} refreshSeconds={60}><p className="text-sm text-text-muted">{text}</p></EmbedShell>;
  if (!tournament) return unavailable('This tournament is not public.');
  const api = await createClient();
  const { data, error } = await api.rpc('get_public_match_state', { p_match_id: matchId });
  const state = data as unknown as State | null;
  if (error || !state) return unavailable('This match is not available.');

  const { home_team: home, away_team: away, sets, match } = state;
  const won = (id: string) => sets.filter((s) => s.winner_team_id === id).length;
  const current = sets.find((s) => s.status === 'LIVE') ?? sets.find((s) => s.status === 'PENDING') ?? sets[sets.length - 1];
  const completed = match.status === 'COMPLETED';
  const winner = match.winner_team_id === home.id ? home.name : match.winner_team_id === away.id ? away.name : null;

  return (
    <EmbedShell theme={theme} title={`${home.name} vs ${away.name}`} subtitle={`${tournament.name}${match.court ? ` · Court ${match.court}` : ''}`} href={href} refreshSeconds={5}>
      <div className="rounded-2xl border border-border bg-surface p-4 text-center">
        <p className={`text-xs font-bold uppercase tracking-widest ${match.status === 'LIVE' ? 'text-live' : 'text-text-muted'}`}>{completed ? 'Final' : match.status === 'LIVE' ? `Live · set ${current?.set_number ?? 1}` : match.status.toLowerCase()}</p>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p className="truncate text-sm font-bold">{home.name}</p>
          <p className="text-4xl font-black tabular-nums" aria-label={`Sets ${won(home.id)} to ${won(away.id)}`}>{won(home.id)} – {won(away.id)}</p>
          <p className="truncate text-sm font-bold">{away.name}</p>
        </div>
        {!completed && current ? <p className="mt-3 text-2xl font-extrabold tabular-nums text-primary" aria-label="Current set points">{current.home_score} : {current.away_score}</p> : null}
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {sets.filter((s) => s.status === 'COMPLETED').map((s) => <span key={s.set_number} className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold tabular-nums text-text-secondary">S{s.set_number} {s.home_score}–{s.away_score}</span>)}
        </div>
        {completed && winner ? <p className="mt-3 text-sm font-bold text-success">{winner} win</p> : null}
      </div>
    </EmbedShell>
  );
}
