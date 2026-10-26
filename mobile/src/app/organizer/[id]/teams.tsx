import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel } from '@/components/tournament';
import { Button, ErrorText, Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { SECOND, SWATCHES } from '@/lib/colors';
import { tint, useTheme } from '@/theme';

type Team = { id: string; name: string; short_name: string | null; status: string; primary_color: string | null; secondary_color: string | null };
type Squad = { id: string; team_id: string; player_id: string; acquisition_type: string; acquisition_amount: number | null; player_profiles: { display_name: string; primary_position: string | null } | null };
type Eligible = { player_id: string; name: string; position: string | null };

const ACQUISITION: Record<string, string> = { AUCTION: 'Auction', ICON_LOT: 'Icon lot', SETTER_LOT: 'Setter lot', MANUAL: 'Manual assignment', MANUAL_ASSIGNMENT: 'Manual assignment' };

/** Teams and squads of one tournament: rename, colours, and manual assignment. */
export default function OrganizerTeams() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [limits, setLimits] = useState<{ min: number; max: number | null }>({ min: 0, max: null });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [tm, sq, regs, settings] = await Promise.all([
      api.from('teams').select('id,name,short_name,status,primary_color,secondary_color').eq('tournament_id', id).order('name'),
      api.from('team_players').select('id,team_id,player_id,acquisition_type,acquisition_amount,player_profiles(display_name,primary_position)').eq('tournament_id', id).eq('status', 'ACTIVE'),
      api.from('player_tournament_registrations').select('player_id,player_profiles(display_name,primary_position)').eq('tournament_id', id).eq('status', 'APPROVED'),
      api.from('tournament_settings').select('min_squad_size,max_squad_size').eq('tournament_id', id).maybeSingle(),
    ]);
    const failure = tm.error ?? sq.error;
    if (failure) return setMessage({ error: true, text: failure.message });
    const squad = sq.data as unknown as Squad[];
    const assigned = new Set(squad.map((s) => s.player_id));
    setTeams(tm.data as Team[]);
    setSquads(squad);
    setEligible(((regs.data ?? []) as unknown as { player_id: string; player_profiles: { display_name: string; primary_position: string | null } | null }[])
      .filter((r) => r.player_profiles && !assigned.has(r.player_id)).map((r) => ({ player_id: r.player_id, name: r.player_profiles!.display_name, position: r.player_profiles!.primary_position })));
    setLimits({ min: (settings.data?.min_squad_size as number | undefined) ?? 0, max: (settings.data?.max_squad_size as number | null | undefined) ?? null });
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <OrganizerFrame id={id} current="teams" title="Teams & Squads" subtitle={name}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Authoritative view of all tournament teams and their assembled squads.</Text>
      {message ? (message.error ? <ErrorText>{message.text}</ErrorText> : <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{message.text}</Text>) : null}
      {!teams ? <Loading /> : teams.length === 0 ? <Empty text="No teams yet. Approve team applications under Players." /> : teams.map((team) => (
        <TeamCard key={team.id} tournamentId={id} team={team} squad={squads.filter((s) => s.team_id === team.id)} eligible={eligible} limits={limits} setMessage={setMessage} reload={load} />
      ))}
      {teams && teams.length > 0 ? <Text style={{ color: t.textMuted, fontSize: 12, textAlign: 'center' }}>{eligible.length} approved player{eligible.length === 1 ? '' : 's'} waiting for a team</Text> : null}
    </OrganizerFrame>
  );
}

function TeamCard({ tournamentId, team, squad, eligible, limits, setMessage, reload }: { tournamentId: string; team: Team; squad: Squad[]; eligible: Eligible[]; limits: { min: number; max: number | null }; setMessage: (m: { error: boolean; text: string } | null) => void; reload: () => Promise<void> }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(team.name);
  const [primary, setPrimary] = useState(team.primary_color ?? '#4f46e5');
  const [secondary, setSecondary] = useState(team.secondary_color ?? '#ffffff');
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const full = limits.max !== null && squad.length >= limits.max;
  const below = squad.length < limits.min;

  async function run(key: string, action: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(key); setMessage(null);
    const { error } = await action();
    setBusy(null);
    if (error) return setMessage({ error: true, text: error.message });
    setMessage({ error: false, text: done });
    await reload();
  }

  return (
    <View style={[portalCard(t), { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: t.border }} accessibilityLabel="Team colours">
          <View style={{ flex: 1, backgroundColor: team.primary_color ?? t.primary }} />
          {team.secondary_color ? <View style={{ flex: 1, backgroundColor: team.secondary_color }} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{team.name}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>{squad.length}{limits.max ? ` / ${limits.max}` : ''} players</Text>
        </View>
        <Pill label={below ? 'Below minimum' : full ? 'Squad full' : 'Valid squad'} tone={below ? 'live' : 'success'} />
      </View>

      {squad.map((s) => (
        <View key={s.id} style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{s.player_profiles?.display_name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{[s.player_profiles?.primary_position ? positionLabel(s.player_profiles.primary_position) : null, ACQUISITION[s.acquisition_type] ?? s.acquisition_type, s.acquisition_amount ? `₹${Number(s.acquisition_amount).toLocaleString('en-IN')}` : null].filter(Boolean).join(' · ')}</Text>
            </View>
            {removing !== s.id ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.player_profiles?.display_name}`} disabled={busy !== null} onPress={() => setRemoving(s.id)} style={{ minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' }}><Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>Remove</Text></Pressable> : null}
          </View>
          {removing === s.id ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>Remove {s.player_profiles?.display_name} from {team.name}? They return to the eligible players list.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Keep" onPress={() => setRemoving(null)} /></View>
                <View style={{ flex: 1 }}><Button tone="danger-outline" title="Confirm remove" loading={busy === s.id} onPress={() => void run(s.id, () => api.rpc('remove_player_manually', { p_tournament_id: tournamentId, p_team_player_id: s.id }), 'Player removed.').then(() => setRemoving(null))} /></View>
              </View>
            </View>
          ) : null}
        </View>
      ))}

      <Button tone="secondary" title={open ? 'Hide team tools' : 'Edit team & assign players'} accessibilityLabel={`Tools for ${team.name}`} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
          <Field label="Team name" value={name} onChangeText={setName} />
          <Button tone="secondary" title="Rename" disabled={busy !== null || name.trim() === '' || name === team.name} loading={busy === 'rename'}
            onPress={() => void run('rename', () => api.rpc('rename_tournament_team', { p_team_id: team.id, p_name: name }), 'Team renamed.')} />
          <Choice label="Main colour" value={primary} options={SWATCHES} onChange={setPrimary} />
          <Choice label="Second colour" value={secondary} options={SECOND} onChange={setSecondary} />
          <Button tone="secondary" title="Save colours" loading={busy === 'colours'} disabled={busy !== null}
            onPress={() => void run('colours', () => api.rpc('set_team_colors', { p_team_id: team.id, p_primary_color: primary, p_secondary_color: secondary }), 'Colours saved.')} />
          <View style={{ gap: 8 }}>
            <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>Assign a player</Text>
            {full ? <Text style={{ color: t.textMuted, fontSize: 13 }}>This squad is full.</Text> : eligible.length === 0 ? <Text style={{ color: t.textMuted, fontSize: 13 }}>No approved players are waiting.</Text> : eligible.map((p) => (
              <View key={p.player_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: tint(t.primary, 0.05), borderRadius: 14, padding: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                  {p.position ? <Text style={{ color: t.textMuted, fontSize: 12 }}>{positionLabel(p.position)}</Text> : null}
                </View>
                <Button title="Assign" accessibilityLabel={`Assign ${p.name} to ${team.name}`} loading={busy === p.player_id} disabled={busy !== null}
                  onPress={() => void run(p.player_id, () => api.rpc('assign_player_manually', { p_tournament_id: tournamentId, p_team_id: team.id, p_player_id: p.player_id, p_acquisition_amount: 0 }), `${p.name} assigned to ${team.name}.`)} />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
