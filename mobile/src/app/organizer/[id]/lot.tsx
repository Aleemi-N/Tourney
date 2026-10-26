import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, LockKeyhole, Shuffle } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, positionTone, Tile } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { applicableLotTypes, lotLabel, requestKey, safeLotError, type LotPlayer, type LotType, type OrganizerLotState } from '@/lib/lot';
import { radius, tint, useTheme } from '@/theme';

type Team = { id: string; name: string; short_name: string | null; primary_color: string | null };
type Readiness = { key: string; status: string; issues: string[] };
type Reveal = { player: LotPlayer; team_id: string; card_number: number; turn_id: string };
type Setup = { types: LotType[]; teams: Team[]; readiness: Readiness[] };

/** Lot draw: prepare, shuffle, start and run the card draw for icon and setter players. */
export default function OrganizerLot() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [setup, setSetup] = useState<Setup | null | undefined>(undefined);
  const [states, setStates] = useState<Partial<Record<LotType, OrganizerLotState>>>({});

  useEffect(() => {
    (async () => {
      const [tn, settings, config, teams, events] = await Promise.all([
        api.from('tournaments').select('format,league_mode').eq('id', id).maybeSingle(),
        api.from('tournament_settings').select('icon_selection_method,setter_selection_method').eq('tournament_id', id).maybeSingle(),
        api.rpc('get_tournament_phase5a_configuration', { p_tournament_id: id }),
        api.from('teams').select('id,name,short_name,primary_color').eq('tournament_id', id).eq('status', 'ACTIVE').order('created_at'),
        api.from('lot_public_events').select('lot_session_id,lot_type,created_at').eq('tournament_id', id).order('created_at', { ascending: false }),
      ]);
      const types = applicableLotTypes(settings.data?.icon_selection_method as string | undefined, settings.data?.setter_selection_method as string | undefined);
      if (tn.data?.format !== 'LEAGUE' || tn.data?.league_mode !== 'AUCTION' || types.length === 0) return setSetup(null);
      const latest = new Map<string, string>();
      for (const e of (events.data ?? []) as { lot_session_id: string; lot_type: string }[]) if (!latest.has(e.lot_type)) latest.set(e.lot_type, e.lot_session_id);
      const initial: Partial<Record<LotType, OrganizerLotState>> = {};
      await Promise.all([...latest.entries()].map(async ([type, sessionId]) => {
        const { data } = await api.rpc('get_lot_organizer_state', { p_lot_session_id: sessionId });
        if (data) initial[type as LotType] = data as unknown as OrganizerLotState;
      }));
      setStates(initial);
      setSetup({ types, teams: (teams.data ?? []) as Team[], readiness: ((config.data as { readiness?: Readiness[] } | null)?.readiness ?? []) });
    })();
  }, [id]);

  return (
    <OrganizerFrame id={id} current="lot" title="Lot Draw" subtitle={name}>
      {setup === undefined ? <Loading /> : setup === null ? <View style={portalCard(t)}><Text style={{ color: t.textSecondary, fontSize: 15 }}>Lot Draw is not configured for this tournament. Choose the lot draw method for icon or setter players in Settings, on an auction league.</Text></View> : (
        <Draw tournamentId={id} setup={setup} states={states} setStates={setStates} />
      )}
    </OrganizerFrame>
  );
}

function Draw({ tournamentId, setup, states, setStates }: { tournamentId: string; setup: Setup; states: Partial<Record<LotType, OrganizerLotState>>; setStates: (s: Partial<Record<LotType, OrganizerLotState>>) => void }) {
  const t = useTheme();
  const { types, teams, readiness } = setup;
  const [activeType, setActiveType] = useState<LotType>(types[0]);
  const [teamOrder, setTeamOrder] = useState(teams.map((x) => x.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const key = useRef<string | null>(null);
  const state = states[activeType];
  const statesRef = useRef(states);
  statesRef.current = states;

  const refresh = useCallback(async (type: LotType, sessionId: string | undefined) => {
    if (!sessionId) return;
    const { data, error: e } = await api.rpc('get_lot_organizer_state', { p_lot_session_id: sessionId });
    if (e) setError(safeLotError(e.message)); else if (data) setStates({ ...statesRef.current, [type]: data as unknown as OrganizerLotState });
  }, [setStates]);

  const sessionId = state?.session.id;
  const sessionStatus = state?.session.status;
  useEffect(() => {
    if (!sessionId || sessionStatus === 'CANCELLED') return;
    const channel = api.channel(`lot-organizer-${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lot_public_events', filter: `lot_session_id=eq.${sessionId}` }, () => { if (!reveal) void refresh(activeType, sessionId); })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(activeType, sessionId); });
    return () => { void api.removeChannel(channel); };
  }, [activeType, refresh, reveal, sessionId, sessionStatus]);

  async function run(operation: () => PromiseLike<{ error: { message: string } | null }>, after?: () => Promise<void>) {
    setBusy(true); setError('');
    const result = await operation();
    if (result.error) setError(safeLotError(result.error.message)); else await after?.();
    setBusy(false);
  }

  const move = (index: number, delta: number) => setTeamOrder((cur) => {
    const next = [...cur]; const target = index + delta;
    if (target < 0 || target >= next.length) return cur;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });

  async function prepare() {
    setBusy(true); setError('');
    const { data, error: e } = await api.rpc('prepare_lot_session', { p_tournament_id: tournamentId, p_lot_type: activeType, p_team_order: teamOrder });
    if (e) setError(safeLotError(e.message)); else if (data) await refresh(activeType, data as unknown as string);
    setBusy(false);
  }

  async function selectCard(cardNumber: number) {
    const turn = state?.turns.find((x) => x.status === 'ACTIVE');
    if (!state || !turn || busy || reveal) return;
    key.current ??= requestKey();
    setBusy(true); setError('');
    const { data, error: e } = await api.rpc('select_lot', { p_lot_session_id: state.session.id, p_lot_number: cardNumber, p_expected_turn_id: turn.id, p_request_key: key.current });
    if (e) { setError(safeLotError(e.message)); await refresh(activeType, state.session.id); }
    else if (data) { setReveal(data as unknown as Reveal); key.current = null; }
    setBusy(false);
  }

  const selected = state?.cards.filter((c) => c.status === 'SELECTED').length ?? state?.turns.filter((x) => x.status === 'COMPLETED').length ?? 0;
  const activeTurn = state?.turns.find((x) => x.status === 'ACTIVE');
  const currentTeam = teams.find((x) => x.id === activeTurn?.team_id);
  const ready = readiness.find((r) => r.key === `${activeType}_LOT`);
  const cancelledEmpty = state?.session.status === 'CANCELLED' && selected === 0;
  const showPrepare = !state || cancelledEmpty;
  const classification = activeType === 'ICON' ? 'Icon' : 'Setter';

  const playerRow = (p: LotPlayer) => {
    const tone = positionTone(p.primary_position, t);
    return (
      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tint(tone, 0.06), borderRadius: radius.xl, padding: 10 }}>
        <Tile label={p.display_name.slice(0, 2).toUpperCase()} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{p.display_name}</Text>
          <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>{positionLabel(p.primary_position)}</Text>
        </View>
      </View>
    );
  };

  if (reveal) {
    return (
      <View style={[portalCard(t), { gap: 14, alignItems: 'center', borderColor: t.primary }]}>
        <Text style={{ color: t.primary, fontSize: 13, fontWeight: '800', letterSpacing: 2 }}>AUTHORITATIVE REVEAL</Text>
        <Tile label={reveal.player.display_name.slice(0, 2).toUpperCase()} size={96} />
        <Text style={{ color: t.text, fontSize: 28, fontWeight: '800', textAlign: 'center' }}>{reveal.player.display_name}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 15 }}>{positionLabel(reveal.player.primary_position)}</Text>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Assigned to {teams.find((x) => x.id === reveal.team_id)?.name ?? 'team'}</Text>
        <Button title="Next" onPress={() => { const sid = state!.session.id; setReveal(null); void refresh(activeType, sid); }} />
      </View>
    );
  }

  return (
    <>
      {types.length > 1 ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {types.map((type) => (
            <Pressable key={type} accessibilityRole="tab" accessibilityState={{ selected: type === activeType }} onPress={() => setActiveType(type)} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.xl, justifyContent: 'center', backgroundColor: type === activeType ? t.primary : t.surface, borderWidth: 1, borderColor: type === activeType ? t.primary : t.border }}>
              <Text style={{ color: type === activeType ? t.primaryText : t.textSecondary, fontSize: 14, fontWeight: '700' }}>{lotLabel(type)} · {states[type]?.session.status ?? 'Not started'}</Text>
            </Pressable>
          ))}
        </View>
      ) : <Text style={{ color: t.primary, fontSize: 12, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' }}>{lotLabel(activeType)}</Text>}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {cancelledEmpty ? (
        <View style={[portalCard(t), { borderColor: t.danger }]}>
          <Text style={{ color: t.danger, fontSize: 16, fontWeight: '800' }}>{lotLabel(activeType)} session cancelled</Text>
          {state?.session.cancellation_reason ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>Reason: {state.session.cancellation_reason}</Text> : null}
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>The cancelled session is kept for audit history. A brand-new session will be created.</Text>
        </View>
      ) : null}

      {activeTurn ? (
        <View style={[portalCard(t), { alignItems: 'center', borderColor: t.primary, backgroundColor: tint(t.primary, 0.08) }]}>
          <Text style={{ color: t.primary, fontSize: 12, fontWeight: '900', letterSpacing: 3 }}>NOW PICKING</Text>
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '900', textAlign: 'center' }}>{currentTeam?.name ?? 'Team'}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>Round {activeTurn.round_number} · pick {activeTurn.turn_order}</Text>
        </View>
      ) : null}

      {showPrepare ? (
        <>
          <View style={[portalCard(t), { gap: 10 }]}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Confirm team order</Text>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>This order repeats across capacity-safe rounds.</Text>
            {teamOrder.map((teamId, index) => {
              const team = teams.find((x) => x.id === teamId)!;
              return (
                <View key={teamId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surfaceMuted, borderRadius: radius.xl, padding: 8, paddingLeft: 12 }}>
                  <Text style={{ width: 22, color: t.textMuted, fontWeight: '800' }}>{index + 1}</Text>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: team.primary_color ?? t.primary }} />
                  <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '600' }}>{team.name}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Move ${team.name} up`} disabled={index === 0} onPress={() => move(index, -1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: index === 0 ? 0.3 : 1 }}><ArrowUp size={18} color={t.text} /></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Move ${team.name} down`} disabled={index === teamOrder.length - 1} onPress={() => move(index, 1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: index === teamOrder.length - 1 ? 0.3 : 1 }}><ArrowDown size={18} color={t.text} /></Pressable>
                </View>
              );
            })}
          </View>
          <View style={[portalCard(t), { gap: 8 }]}>
            <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Readiness</Text>
            <Text style={{ color: ready?.status === 'READY' ? t.success : t.warning, fontSize: 16, fontWeight: '800' }}>{ready?.status ?? 'BLOCKED'}</Text>
            {ready?.issues?.map((issue) => <Text key={issue} style={{ color: t.textSecondary, fontSize: 13 }}>• {issue}</Text>)}
            <Button title={cancelledEmpty ? `Start New ${classification} Lot` : 'Prepare Lot'} loading={busy} disabled={busy || ready?.status !== 'READY' || teamOrder.length === 0} onPress={() => void prepare()} />
          </View>
        </>
      ) : null}

      {sessionStatus === 'PREPARING' && state ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, backgroundColor: tint(t.warning, 0.1), borderRadius: radius.xl, padding: 12, alignItems: 'center' }}>
            <LockKeyhole size={18} color={t.warning} />
            <Text style={{ flex: 1, color: t.text, fontSize: 13 }}>Once shuffled, the card mapping is locked. Restarting requires cancellation with a reason.</Text>
          </View>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Eligible player pool ({state.eligible_players.length})</Text>
          <View style={{ gap: 8 }}>{state.eligible_players.map(playerRow)}</View>
          <Button title="Confirm & Shuffle" icon={<Shuffle size={18} color={t.primaryText} />} loading={busy} onPress={() => void run(() => api.rpc('shuffle_lot_session', { p_lot_session_id: state.session.id }), () => refresh(activeType, state.session.id))} />
        </>
      ) : null}

      {sessionStatus === 'SHUFFLED' && state ? (
        <View style={[portalCard(t), { alignItems: 'center', gap: 12 }]}>
          <Text style={{ color: t.textSecondary, fontSize: 14, textAlign: 'center' }}>Cards are anonymously shuffled and locked.</Text>
          <Button title="Start Lot Draw" loading={busy} onPress={() => void run(() => api.rpc('start_lot_session', { p_lot_session_id: state.session.id }), () => refresh(activeType, state.session.id))} />
        </View>
      ) : null}

      {state && ['SHUFFLED', 'LIVE', 'COMPLETED'].includes(state.session.status) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {state.cards.map((card) => {
            const disabled = card.status !== 'AVAILABLE' || state.session.status !== 'LIVE' || busy;
            return (
              <Pressable key={card.lot_number} accessibilityRole="button" accessibilityLabel={`Card ${card.lot_number}, ${card.status.toLowerCase()}`} disabled={disabled} onPress={() => void selectCard(card.lot_number)}
                style={{ width: '22%', flexGrow: 1, aspectRatio: 3 / 4, borderRadius: radius.xl, borderWidth: 1, borderColor: tint(t.primary, 0.3), backgroundColor: tint(t.primary, 0.1), alignItems: 'center', justifyContent: 'center', opacity: disabled && card.status === 'AVAILABLE' ? 0.5 : card.status === 'SELECTED' ? 0.45 : 1 }}>
                <Text style={{ color: t.primary, fontSize: 26, fontWeight: '900' }}>{card.status === 'SELECTED' ? '✓' : card.lot_number}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {sessionStatus === 'COMPLETED' ? (
        <View style={[portalCard(t), { alignItems: 'center', borderColor: t.success }]}>
          <Text style={{ color: t.text, fontSize: 22, fontWeight: '900' }}>{classification.toUpperCase()} PLAYER LOT COMPLETE</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>{selected} players assigned.</Text>
        </View>
      ) : null}

      {state && selected === 0 && ['PREPARING', 'SHUFFLED', 'LIVE'].includes(state.session.status) ? (
        !cancelling ? <Button tone="danger-outline" title="Cancel session" onPress={() => setCancelling(true)} /> : (
          <View style={[portalCard(t), { gap: 10 }]}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Cancel this lot session?</Text>
            <Field label="Reason" value={reason} onChangeText={setReason} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><Button tone="secondary" title="Keep" onPress={() => setCancelling(false)} /></View>
              <View style={{ flex: 1 }}><Button tone="danger-outline" title="Cancel session" loading={busy} disabled={reason.trim() === ''} onPress={() => void run(() => api.rpc('cancel_lot_session', { p_lot_session_id: state.session.id, p_reason: reason }), async () => { setCancelling(false); setReason(''); await refresh(activeType, state.session.id); })} /></View>
            </View>
          </View>
        )
      ) : null}
      {types.length === 0 ? <Empty text="No lot types." /> : null}
    </>
  );
}
