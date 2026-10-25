import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { FixtureManager } from '@/components/organizer/FixtureManager';
import { MatchFormatSection } from '@/components/organizer/MatchFormatSection';

export const metadata: Metadata = { title: 'Fixtures & Scorers' };

export default async function OrganizerFixturesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name,slug,format,venue,start_date,end_date').eq('id', id).maybeSingle();
  if (!tournament) notFound();
  const [{ data: stages }, { data: rawMatches }, { data: staff }, { count: teamCount }, { data: rules }, { data: fullRules }, { data: branding }, { data: orderScopes }, { data: progressionPlans }] = await Promise.all([
    supabase.from('tournament_stages').select('id,name,stage_type,sequence,qualification_count,status,standings_rules(win_points,loss_points,tie_break_rules),standings(team_id,played,won,lost,league_points,sets_won,sets_lost,points_for,points_against,teams(name))').eq('tournament_id', id).order('sequence'),
    supabase.from('matches').select('id,stage_id,match_number,program_order,round_number,bracket_position,bracket_match_type,status,sets_to_win,format_override,scheduled_at,venue,court,home_team_id,away_team_id,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name),match_scorers(user_id)').eq('tournament_id', id).order('round_number').order('program_order'),
    supabase.rpc('get_tournament_staff', { p_tournament_id: id }),
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('tournament_id', id).eq('status', 'ACTIVE'),
    supabase.from('volleyball_rules').select('id,stage_id').eq('tournament_id', id),
    supabase.from('volleyball_rules').select('id,stage_id,sets_to_win,win_by_two,set_rules:volleyball_set_rules(set_number,target_points)').eq('tournament_id', id),
    supabase.from('tournament_branding').select('logo_path,primary_color,secondary_color').eq('tournament_id', id).maybeSingle(),
    supabase.from('match_order_scopes').select('stage_id,round_number,revision').eq('tournament_id', id),
    supabase.from('tournament_progression_plans').select('source_stage_id').eq('tournament_id', id),
  ]);
  const matches = (rawMatches ?? []).map((match) => ({ ...match, scorer_user_id: match.match_scorers?.[0]?.user_id ?? null })) as unknown as Parameters<typeof FixtureManager>[0]['matches'];
  const scorers = ((staff ?? []) as unknown as Array<{ user_id: string; display_name: string; email: string; roles: string[] }>).filter((member) => member.roles?.includes('SCORER'));
  const logoUrl = branding?.logo_path ? supabase.storage.from('logos').getPublicUrl(branding.logo_path).data.publicUrl : null;
  const stagesSimple = (stages ?? []).map((s) => ({ id: s.id, name: s.name }));
  return (
    <main className="mx-auto max-w-6xl p-5 sm:p-8 space-y-10">
      <div>
        <p className="text-sm text-text-secondary">{tournament.name}</p>
        <h1 className="mt-2 text-3xl font-black text-text-primary">Fixtures &amp; Scorers</h1>
        <p className="mt-3 max-w-2xl text-text-secondary">Set up the competition, generate authoritative fixtures, and manage saved schedules.</p>
      </div>
      <MatchFormatSection
        tournamentId={id}
        stages={stagesSimple}
        rules={(fullRules ?? []) as unknown as Parameters<typeof MatchFormatSection>[0]['rules']}
      />
      <FixtureManager
        tournament={{ ...tournament, teamCount: teamCount ?? 0, rulesReady: (rules?.length ?? 0) > 0, logoUrl, primaryColor: branding?.primary_color ?? null, secondaryColor: branding?.secondary_color ?? null }}
        stages={(stages ?? []) as unknown as Parameters<typeof FixtureManager>[0]['stages']}
        matches={matches}
        scorers={scorers}
        orderScopes={(orderScopes ?? []) as Parameters<typeof FixtureManager>[0]['orderScopes']}
        progressionPlans={(progressionPlans ?? []) as Parameters<typeof FixtureManager>[0]['progressionPlans']}
      />
    </main>
  );
}
