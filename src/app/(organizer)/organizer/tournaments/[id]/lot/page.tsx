import { createClient } from '@/lib/supabase/server';
import { applicableLotTypes, isLotDrawEnabled, type OrganizerLotState } from '@/lib/lot-draw';
import { LotDrawClient } from './LotDrawClient';

export default async function LotDrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: tournament }, { data: settings }, { data: configuration }, { data: teams }, { data: events }] = await Promise.all([
    supabase.from('tournaments').select('id,name,format,league_mode').eq('id', id).single(),
    supabase.from('tournament_settings').select('icon_selection_method,setter_selection_method,max_squad_size').eq('tournament_id', id).single(),
    supabase.rpc('get_tournament_phase5a_configuration', { p_tournament_id: id }),
    supabase.from('teams').select('id,name,short_name,primary_color').eq('tournament_id', id).eq('status', 'ACTIVE').order('created_at'),
    supabase.from('lot_public_events').select('lot_session_id,lot_type,sequence_number,created_at').eq('tournament_id', id).order('created_at', { ascending: false }),
  ]);

  if (!tournament || !settings || !isLotDrawEnabled(tournament.format, tournament.league_mode, settings.icon_selection_method, settings.setter_selection_method)) {
    return <main className="mx-auto max-w-4xl p-6 md:p-10"><div className="rounded-2xl border border-border bg-surface p-8"><h1 className="text-2xl font-bold">Lot Draw is not configured for this tournament</h1><p className="mt-2 text-text-secondary">Enable Icon or Setter Lot Draw in tournament settings to use this area.</p></div></main>;
  }

  const latestIds = new Map<string, string>();
  for (const event of events ?? []) if (!latestIds.has(event.lot_type)) latestIds.set(event.lot_type, event.lot_session_id);
  const states: Partial<Record<'ICON' | 'SETTER', OrganizerLotState>> = {};
  await Promise.all([...latestIds.entries()].map(async ([type, sessionId]) => {
    const { data } = await supabase.rpc('get_lot_organizer_state', { p_lot_session_id: sessionId });
    if (data) states[type as 'ICON' | 'SETTER'] = data as unknown as OrganizerLotState;
  }));

  const readiness = ((configuration as { readiness?: Array<{ key: string; status: string; issues: string[] }> } | null)?.readiness ?? []);
  return <LotDrawClient tournament={{ id, name: tournament.name }} types={applicableLotTypes(settings.icon_selection_method, settings.setter_selection_method)} teams={teams ?? []} readiness={readiness} initialStates={states} />;
}
