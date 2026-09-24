import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FixtureManager } from '@/components/organizer/FixtureManager';

export const metadata: Metadata = { title: 'Fixtures & Scorers' };

export default async function OrganizerFixturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name').eq('id', id).maybeSingle();
  if (!tournament) notFound();
  const [{ data: stages }, { data: rawMatches }, { data: staff }] = await Promise.all([
    supabase.from('tournament_stages').select('id,name,stage_type,sequence').eq('tournament_id', id).order('sequence'),
    supabase.from('matches').select('id,stage_id,match_number,status,home_team_id,away_team_id,teams!matches_home_team_id_fkey(name),teams!matches_away_team_id_fkey(name),match_scorers(user_id)').eq('tournament_id', id).order('match_number'),
    supabase.rpc('get_tournament_staff', { p_tournament_id: id }),
  ]);
  const matches = (rawMatches ?? []).map((match) => { const row = match as unknown as { id: string; stage_id: string | null; match_number: number | null; status: string; home_team_id: string; away_team_id: string; teams: { name: string } | { name: string }[] | null; match_scorers: { user_id: string }[] }; const teams = Array.isArray(row.teams) ? row.teams : row.teams ? [row.teams] : []; return { ...row, home_team: teams[0] ?? null, away_team: teams[1] ?? null, scorer_user_id: row.match_scorers?.[0]?.user_id ?? null }; });
  const scorers = ((staff ?? []) as unknown as Array<{ user_id: string; display_name: string; email: string; roles: string[] }>).filter((member) => member.roles?.includes('SCORER'));
  return <main className="mx-auto max-w-6xl p-5 sm:p-8"><p className="text-sm text-text-secondary">{tournament.name}</p><h1 className="mt-2 text-3xl font-black text-text-primary">Fixtures & Scorers</h1><p className="mt-3 max-w-2xl text-text-secondary">Generate safe, retryable schedules and assign only active tournament scorers.</p><div className="mt-8"><FixtureManager stages={stages ?? []} matches={matches} scorers={scorers} /></div></main>;
}