import { Download } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { shareCsv, type Cell } from '@/lib/csv';
import { useTheme } from '@/theme';

const stamp = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '');

/** CSV exports of a tournament for spreadsheets: registrations, teams and squads, fixtures and standings. */
export function ExportPanel({ tournamentId, slug }: { tournamentId: string; slug: string }) {
  const t = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, build: () => Promise<Cell[][]>) {
    setBusy(key); setError(null);
    try { await shareCsv(`${slug}-${key}.csv`, await build()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not export.'); }
    setBusy(null);
  }
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

  const registrations = async (): Promise<Cell[][]> => {
    const { data, error: e } = await api.from('player_tournament_registrations').select('status,auction_category,created_at,player_profiles(display_name,primary_position,secondary_position,phone,place,date_of_birth,height_cm,jersey_name,jersey_number,jersey_size)').eq('tournament_id', tournamentId).order('created_at');
    fail(e);
    type R = { status: string; auction_category: string | null; created_at: string; player_profiles: Record<string, string | number | null> | null };
    return [['Name', 'Status', 'Route', 'Position', 'Second position', 'Phone', 'City', 'Date of birth', 'Height cm', 'Jersey name', 'Jersey number', 'Jersey size', 'Registered'],
      ...((data ?? []) as unknown as R[]).map((r) => { const p = r.player_profiles ?? {}; return [p.display_name, r.status, r.auction_category, p.primary_position, p.secondary_position, p.phone, p.place, p.date_of_birth, p.height_cm, p.jersey_name, p.jersey_number, p.jersey_size, stamp(r.created_at)]; })];
  };

  const squads = async (): Promise<Cell[][]> => {
    const { data, error: e } = await api.from('team_players').select('acquisition_type,acquisition_amount,teams(name),player_profiles(display_name,primary_position,jersey_number)').eq('tournament_id', tournamentId).eq('status', 'ACTIVE');
    fail(e);
    type R = { acquisition_type: string; acquisition_amount: number | null; teams: { name: string } | null; player_profiles: { display_name: string; primary_position: string | null; jersey_number: string | null } | null };
    return [['Team', 'Player', 'Position', 'Jersey', 'How joined', 'Amount'],
      ...((data ?? []) as unknown as R[]).sort((a, b) => (a.teams?.name ?? '').localeCompare(b.teams?.name ?? '')).map((r) => [r.teams?.name, r.player_profiles?.display_name, r.player_profiles?.primary_position, r.player_profiles?.jersey_number, r.acquisition_type, r.acquisition_amount])];
  };

  const fixtures = async (): Promise<Cell[][]> => {
    const { data, error: e } = await api.from('matches').select('match_number,round_number,status,scheduled_at,venue,court,result_type,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name),match_sets(home_score,away_score,winner_team_id)').eq('tournament_id', tournamentId).order('round_number').order('program_order');
    fail(e);
    type R = { match_number: number | null; round_number: number | null; status: string; scheduled_at: string | null; venue: string | null; court: string | null; result_type: string | null; home_team: { name: string } | null; away_team: { name: string } | null; match_sets: { home_score: number; away_score: number }[] };
    return [['Match', 'Round', 'Home', 'Away', 'Status', 'Result type', 'When', 'Venue', 'Court', 'Set scores'],
      ...((data ?? []) as unknown as R[]).map((r) => [r.match_number, r.round_number, r.home_team?.name, r.away_team?.name, r.status, r.result_type, stamp(r.scheduled_at), r.venue, r.court, r.match_sets.filter((s) => s.home_score + s.away_score > 0).map((s) => `${s.home_score}-${s.away_score}`).join(' ')])];
  };

  const standings = async (): Promise<Cell[][]> => {
    const { data: stages, error: e } = await api.from('tournament_stages').select('id,name').eq('tournament_id', tournamentId).eq('stage_type', 'LEAGUE').order('sequence');
    fail(e);
    const out: Cell[][] = [['Stage', 'Rank', 'Team', 'Played', 'Won', 'Drawn', 'Lost', 'Sets won', 'Sets lost', 'Points for', 'Points against', 'Points']];
    for (const s of (stages ?? []) as { id: string; name: string }[]) {
      const { data } = await api.rpc('get_stage_standings', { p_stage_id: s.id });
      for (const r of (Array.isArray(data) ? data : []) as unknown as Record<string, Cell>[]) out.push([s.name, r.rank, r.team_name, r.played, r.won, r.drawn, r.lost, r.sets_won, r.sets_lost, r.points_for, r.points_against, r.league_points]);
    }
    return out;
  };

  const item = (key: string, label: string, build: () => Promise<Cell[][]>) => (
    <Button key={key} tone="secondary" title={label} accessibilityLabel={`Export ${label}`} icon={<Download size={16} color={t.text} />} loading={busy === key} disabled={busy !== null} onPress={() => void run(key, build)} />
  );
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.textSecondary, fontSize: 13 }}>Spreadsheets (CSV) you can open in Excel or Google Sheets. Registrations include phone numbers and dates of birth: keep them private.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {item('registrations', 'Registrations', registrations)}
      {item('squads', 'Teams and squads', squads)}
      {item('fixtures', 'Fixtures and results', fixtures)}
      {item('standings', 'Standings', standings)}
    </View>
  );
}
