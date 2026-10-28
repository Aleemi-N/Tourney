import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { OverlayRefresh, OverlaySponsors } from './OverlayParts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

type State = {
  match: { id: string; status: string; court: string | null; winner_team_id?: string | null };
  home_team: { id: string; name: string }; away_team: { id: string; name: string };
  sets: { set_number: number; status: string; home_score: number; away_score: number; winner_team_id: string | null }[];
};

/**
 * A scoreboard bar for streaming software (OBS, vMix): add it as a Browser Source with a transparent background.
 * /embed/t/{slug}/overlay/{matchId}   Optional: ?pos=top|bottom  ?sponsors=1  ?refresh=2..30 (seconds, default 3)
 */
export default async function OverlayPage({ params, searchParams }: { params: Promise<{ slug: string; matchId: string }>; searchParams: Promise<{ pos?: string; sponsors?: string; refresh?: string }> }) {
  const { slug, matchId } = await params;
  const { pos, sponsors, refresh } = await searchParams;
  const seconds = Math.min(30, Math.max(2, Number(refresh) || 3));
  const tournament = await getTournamentHeader(slug);
  const supabase = await createClient();
  const { data } = tournament ? await supabase.rpc('get_public_match_state', { p_match_id: matchId }) : { data: null };
  const state = data as unknown as State | null;

  return (
    <div className={`flex min-h-screen flex-col p-4 ${pos === 'top' ? 'justify-start' : 'justify-end'}`} style={{ background: 'transparent' }}>
      {/* The page must stay see-through for the streaming software to composite it. */}
      <style>{'html,body{background:transparent!important}'}</style>
      <OverlayRefresh seconds={seconds} />
      {!state ? null : (() => {
        const { home_team: home, away_team: away, sets, match } = state;
        const won = (id: string) => sets.filter((s) => s.winner_team_id === id).length;
        const current = sets.find((s) => s.status === 'LIVE') ?? sets.find((s) => s.status === 'PENDING') ?? sets[sets.length - 1];
        const completed = match.status === 'COMPLETED';
        return (
          <div className="mx-auto w-full max-w-3xl">
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch overflow-hidden rounded-xl text-white shadow-2xl" style={{ background: 'rgba(10,12,24,0.88)' }}>
              <div className="flex items-center justify-end gap-3 px-5 py-3"><span className="truncate text-xl font-extrabold">{home.name}</span><span className="rounded-md bg-white/15 px-3 py-1 text-2xl font-black tabular-nums">{won(home.id)}</span></div>
              <div className="flex flex-col items-center justify-center bg-white/10 px-5 py-1.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">{completed ? 'Final' : match.status === 'LIVE' ? `Set ${current?.set_number ?? 1}` : match.status.toLowerCase()}</span>
                {!completed && current ? <span className="text-3xl font-black tabular-nums">{current.home_score} : {current.away_score}</span> : null}
              </div>
              <div className="flex items-center gap-3 px-5 py-3"><span className="rounded-md bg-white/15 px-3 py-1 text-2xl font-black tabular-nums">{won(away.id)}</span><span className="truncate text-xl font-extrabold">{away.name}</span></div>
            </div>
            <p className="mt-1 text-center text-xs font-semibold text-white/80" style={{ textShadow: '0 1px 3px rgba(0,0,0,.8)' }}>{tournament?.name}{match.court ? ` · Court ${match.court}` : ''}</p>
          </div>
        );
      })()}
      {sponsors === '1' ? <OverlaySponsors slug={slug} /> : null}
    </div>
  );
}
