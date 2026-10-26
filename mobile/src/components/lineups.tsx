import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice } from '@/components/form';
import { Text } from '@/components/text';
import { Button, Card, ErrorText, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { BACK_ROW, courtFor, FRONT_ROW, isBackRow, ROMAN, shortName, type Court, type LineupData, type LinePlayer, type Squad } from '@/lib/lineup';
import { onColor, radius, tint, useTheme } from '@/theme';

/** The lineups of a match (starting orders, substitutions, rotations, player of the match). `refreshKey` reloads it. */
export function useLineups(matchId: string, refreshKey: string) {
  const [data, setData] = useState<LineupData | null>(null);
  const reload = useCallback(async () => {
    const { data: d } = await api.rpc('get_match_lineups', { p_match_id: matchId });
    setData((d as unknown as LineupData | null) ?? null);
  }, [matchId]);
  useEffect(() => { void reload(); }, [reload, refreshKey]);
  return { data, reload };
}

/** Six positions on a court diagram: front row IV, III, II and back row V, VI, I. */
export function CourtView({ court, color, serving }: { court: Court; color: string; serving: boolean }) {
  const t = useTheme();
  const cell = (index: number) => {
    const p = court.positions[index];
    const isServer = serving && index === 0;
    const libero = court.libero?.id === p.id;
    return (
      <View key={index} accessibilityLabel={`Position ${ROMAN[index]}: ${p.name}${isServer ? ', serving' : ''}${libero ? ', libero' : ''}`}
        style={{ flex: 1, minHeight: 64, borderRadius: radius.xl, borderWidth: isServer ? 2 : 1, borderColor: isServer ? color : t.border, backgroundColor: libero ? tint(t.warning, 0.12) : tint(color, 0.08), padding: 6, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Text style={{ color: t.textMuted, fontSize: 10, fontWeight: '800' }}>{ROMAN[index]}{isServer ? ' · SERVE' : ''}</Text>
        <Text numberOfLines={1} style={{ color: t.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{shortName(p.name)}</Text>
        {p.number || libero ? <Text style={{ color: libero ? t.warning : t.textMuted, fontSize: 11, fontWeight: '700' }}>{libero ? 'Libero' : `#${p.number}`}</Text> : null}
      </View>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 1 }}>NET</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>{FRONT_ROW.map(cell)}</View>
      <View style={{ flexDirection: 'row', gap: 6 }}>{BACK_ROW.map(cell)}</View>
    </View>
  );
}

/** Read-only lineups for the public match screen. */
export function LineupsCard({ data, setNumber, teams, colors, servingId }: { data: LineupData | null; setNumber: number; teams: { id: string; name: string }[]; colors: Record<string, string>; servingId: string | null }) {
  const t = useTheme();
  const shown = teams.map((team) => ({ team, court: courtFor(data, setNumber, team.id) })).filter((x) => x.court);
  if (shown.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '600' }}>On court · set {setNumber}</Text>
      {shown.map(({ team, court }) => (
        <Card key={team.id} style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '800' }}>{team.name}</Text>
          <CourtView court={court!} color={colors[team.id] ?? t.primary} serving={servingId === team.id} />
        </Card>
      ))}
    </View>
  );
}

type Setup = { teamId: string; picked: string[]; libero: string };

/** The scorer's lineup tools: set the starting six and libero, show the court with rotation, substitute. */
export function ScorerLineups({ matchId, setNumber, teams, colors, servingId, started, disabled, refreshKey, onChanged }: {
  matchId: string; setNumber: number; teams: { id: string; name: string }[]; colors: Record<string, string>; servingId: string | null; started: boolean; disabled: boolean; refreshKey: string; onChanged: () => Promise<void>;
}) {
  const t = useTheme();
  const { data, reload } = useLineups(matchId, refreshKey);
  const [squads, setSquads] = useState<Squad[]>([]);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [subTeam, setSubTeam] = useState<string | null>(null);
  const [mode, setMode] = useState<'SUB' | 'LIBERO' | null>(null);
  const [off, setOff] = useState('');
  const [on, setOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.rpc('get_match_squads', { p_match_id: matchId }).then(({ data: d }) => setSquads((d as unknown as Squad[]) ?? []));
  }, [matchId]);

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setError(null);
    const { error: e } = await action();
    setBusy(false);
    if (e) return setError(e.message);
    setSetup(null); setMode(null); setOff(''); setOn('');
    await reload();
    await onChanged();
  }

  const squadOf = (teamId: string) => squads.find((s) => s.team_id === teamId)?.players ?? [];
  const label = (p: { name: string; number: string | null }) => `${p.number ? `#${p.number} ` : ''}${shortName(p.name)}`;

  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>Lineups · set {setNumber}</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {teams.map((team) => {
        const court = courtFor(data, setNumber, team.id);
        const squad = squadOf(team.id);
        const color = colors[team.id] ?? t.primary;
        const onCourtIds = court ? court.positions.map((p) => p.id) : [];
        const bench = squad.filter((p) => !onCourtIds.includes(p.id));
        const editing = setup?.teamId === team.id;
        const subbing = subTeam === team.id && mode;
        return (
          <Card key={team.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '800' }}>{team.name}</Text>
              {court ? <Pill label={`Subs ${court.subsUsed}/6`} tone={court.subsUsed >= 6 ? 'live' : 'neutral'} /> : null}
            </View>

            {court && !editing ? (
              <>
                <CourtView court={court} color={color} serving={servingId === team.id} />
                {!started ? <Button tone="secondary" title="Change lineup" disabled={disabled || busy} onPress={() => setSetup({ teamId: team.id, picked: [], libero: '' })} /> : null}
                {started && !subbing ? (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <View style={{ flexGrow: 1 }}><Button tone="secondary" title="Substitute" accessibilityLabel={`Substitute for ${team.name}`} disabled={disabled || busy || court.subsUsed >= 6} onPress={() => { setSubTeam(team.id); setMode('SUB'); setOff(''); setOn(''); }} /></View>
                    {court.libero ? <View style={{ flexGrow: 1 }}><Button tone="secondary" title={court.liberoOnCourt ? 'Libero off' : 'Libero on'} accessibilityLabel={`Libero swap for ${team.name}`} disabled={disabled || busy} onPress={() => { setSubTeam(team.id); setMode('LIBERO'); setOff(court.liberoOnCourt ? court.libero!.id : ''); setOn(''); }} /></View> : null}
                    <Button tone="ghost" title="Undo last" accessibilityLabel={`Undo last substitution for ${team.name}`} disabled={disabled || busy || !data?.substitutions.some((s) => s.set_number === setNumber && s.team_id === team.id)}
                      onPress={() => void run(() => api.rpc('undo_last_substitution', { p_match_id: matchId, p_set_number: setNumber, p_team_id: team.id }))} />
                  </View>
                ) : null}
                {subbing ? (
                  <View style={{ gap: 10 }}>
                    {mode === 'LIBERO' && court.liberoOnCourt ? (
                      <Text style={{ color: t.textSecondary, fontSize: 13 }}>The libero goes off. Who comes back on?</Text>
                    ) : (
                      <Choice label={mode === 'LIBERO' ? 'Back-row player the libero replaces' : 'Going off'} value={off} onChange={setOff}
                        options={court.positions.map((p, i) => ({ p, i })).filter(({ p, i }) => (mode === 'LIBERO' ? isBackRow(i) && p.id !== court.libero?.id : p.id !== court.libero?.id)).map(({ p, i }) => ({ value: p.id, label: `${ROMAN[i]} · ${label(p)}` }))} />
                    )}
                    {mode === 'SUB' || (mode === 'LIBERO' && court.liberoOnCourt) ? (
                      <Choice label="Coming on" value={on} onChange={setOn} options={bench.filter((p) => p.id !== court.libero?.id).map((p) => ({ value: p.id, label: label(p) }))} />
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => { setMode(null); setSubTeam(null); }} /></View>
                      <View style={{ flex: 1 }}>
                        <Button title="Confirm" loading={busy} disabled={!off || (mode === 'SUB' && !on) || (mode === 'LIBERO' && court.liberoOnCourt && !on)}
                          onPress={() => void run(() => api.rpc('record_substitution', {
                            p_match_id: matchId, p_set_number: setNumber, p_team_id: team.id,
                            p_kind: mode === 'SUB' ? 'SUB' : court.liberoOnCourt ? 'LIBERO_OUT' : 'LIBERO_IN',
                            p_out: off, p_in: mode === 'LIBERO' && !court.liberoOnCourt ? court.libero!.id : on,
                          }))} />
                      </View>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}

            {!court && !editing ? (
              <>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>No lineup recorded for this set. Choose the starting six in order I to VI, and the libero.</Text>
                <Button tone="secondary" title="Set lineup" accessibilityLabel={`Set lineup for ${team.name}`} disabled={disabled || busy || squad.length < 6} onPress={() => setSetup({ teamId: team.id, picked: [], libero: '' })} />
                {squad.length < 6 ? <Text style={{ color: t.textMuted, fontSize: 12 }}>This team has fewer than six players in its squad.</Text> : null}
              </>
            ) : null}

            {editing && setup ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>Tap players in order: first is position I (the server), then II to VI.</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {squad.map((p) => {
                    const at = setup.picked.indexOf(p.id);
                    const isLibero = setup.libero === p.id;
                    return (
                      <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: at >= 0 || isLibero }} accessibilityLabel={`${label(p)}${at >= 0 ? `, position ${ROMAN[at]}` : ''}`}
                        onPress={() => setSetup({ ...setup, picked: at >= 0 ? setup.picked.filter((x) => x !== p.id) : setup.picked.length < 6 ? [...setup.picked, p.id] : setup.picked, libero: isLibero ? '' : setup.libero })}
                        style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: radius.xl, justifyContent: 'center', borderWidth: 1, borderColor: at >= 0 ? color : t.border, backgroundColor: at >= 0 ? color : t.surface }}>
                        <Text style={{ color: at >= 0 ? onColor(color) : t.text, fontSize: 13, fontWeight: '700' }}>{at >= 0 ? `${ROMAN[at]} · ` : ''}{label(p)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Choice label="Libero (optional)" value={setup.libero} onChange={(v) => setSetup({ ...setup, libero: setup.libero === v ? '' : v })}
                  options={squad.filter((p) => !setup.picked.includes(p.id)).map((p) => ({ value: p.id, label: label(p) }))} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setSetup(null)} /></View>
                  <View style={{ flex: 1 }}>
                    <Button title="Save lineup" loading={busy} disabled={setup.picked.length !== 6}
                      onPress={() => void run(() => api.rpc('set_set_lineup', { p_match_id: matchId, p_set_number: setNumber, p_team_id: team.id, p_slots: setup.picked, p_libero: (setup.libero || undefined) as string }))} />
                  </View>
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

/** Player of the match: picked by the scorer or an organizer once the match is finished. */
export function MvpPicker({ matchId, mvp, onChanged }: { matchId: string; mvp: { id: string; name: string } | null; onChanged: () => Promise<void> }) {
  const t = useTheme();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.rpc('get_match_squads', { p_match_id: matchId }).then(({ data: d }) => setSquads((d as unknown as Squad[]) ?? []));
  }, [matchId]);

  async function pick(playerId: string | null) {
    setBusy(true); setError(null);
    const { error: e } = playerId ? await api.rpc('set_match_mvp', { p_match_id: matchId, p_player_id: playerId }) : await api.rpc('clear_match_mvp', { p_match_id: matchId });
    setBusy(false);
    if (e) return setError(e.message);
    setOpen(false);
    await onChanged();
  }

  return (
    <Card style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>Player of the match</Text>
      {mvp ? <Text style={{ color: t.warning, fontSize: 18, fontWeight: '800' }}>🏆 {mvp.name}</Text> : <Text style={{ color: t.textSecondary, fontSize: 14 }}>Not chosen yet.</Text>}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!open ? <Button tone="secondary" title={mvp ? 'Change' : 'Choose player'} onPress={() => setOpen(true)} /> : (
        <View style={{ gap: 8 }}>
          {squads.flatMap((s) => s.players).map((p) => (
            <Button key={p.id} tone={mvp?.id === p.id ? 'primary' : 'secondary'} title={`${p.number ? `#${p.number} ` : ''}${p.name}`} accessibilityLabel={`Player of the match ${p.name}`} disabled={busy} onPress={() => void pick(p.id)} />
          ))}
          {mvp ? <Button tone="danger-outline" title="Clear" disabled={busy} onPress={() => void pick(null)} /> : null}
          <Button tone="ghost" title="Cancel" onPress={() => setOpen(false)} />
        </View>
      )}
    </Card>
  );
}
