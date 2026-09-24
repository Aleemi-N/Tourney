import { createClient } from '@/lib/supabase/server';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';

export default async function PublicFixturesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name').eq('slug', slug).eq('is_public', true).maybeSingle();
  if (!tournament) return <div className="p-10 text-white">Tournament not found.</div>;
  const { data: fixtures } = await supabase.from('public_fixture_view').select('id,match_number,scheduled_at,venue,court,status,home_team_id,away_team_id,total_home_score,total_away_score').eq('tournament_id', tournament.id).order('scheduled_at', { ascending: true, nullsFirst: false }).order('match_number', { ascending: true });
  const teamIds = [...new Set((fixtures ?? []).flatMap((fixture) => [fixture.home_team_id, fixture.away_team_id]).filter(Boolean))];
  const { data: teams } = teamIds.length ? await supabase.from('public_team_view').select('id,name,short_name').in('id', teamIds) : { data: [] };
  const teamName = (id: string | null) => teams?.find((team) => team.id === id)?.name ?? 'TBD';
  return <PublicTournamentFrame slug={slug} name={tournament.name}><p className="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-200/70">Schedule</p><h1 className="mt-3 text-4xl font-black">Fixtures</h1><div className="mt-8 space-y-3">{fixtures?.map((fixture) => <article key={fixture.id} className="rounded-2xl border border-white/10 bg-white/3 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-white/40">Match {fixture.match_number ?? '—'} · {fixture.status}</p><h2 className="mt-2 text-xl font-black">{teamName(fixture.home_team_id)} <span className="text-white/35">vs</span> {teamName(fixture.away_team_id)}</h2></div><p className="text-sm text-white/50">{fixture.scheduled_at ? new Date(fixture.scheduled_at).toLocaleString('en-IN') : 'Time TBC'}</p></div><p className="mt-3 text-sm text-white/45">{fixture.venue ?? 'Venue TBC'}{fixture.court ? ` · ${fixture.court}` : ''}</p></article>)}{(!fixtures || fixtures.length === 0) && <Empty text="Fixtures will appear when the organizer generates the stage schedule." />}</div></PublicTournamentFrame>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-3xl border border-dashed border-white/15 bg-white/3 p-8 text-sm text-white/55">{text}</div>; }