'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, ArrowUp, Ban, Expand, LockKeyhole, Plus, Shuffle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PlayerCard } from '@/components/player/PlayerCard';
import { lotLabel, safeLotError, type LotPlayer, type LotType, type OrganizerLotState } from '@/lib/lot-draw';

type Team = { id: string; name: string; short_name: string | null; primary_color: string | null };
type Readiness = { key: string; status: string; issues: string[] };
type Reveal = { player: LotPlayer; team_id: string; card_number: number; turn_id: string };

export function LotDrawClient({ tournament, types, teams, readiness, initialStates }: { tournament: { id: string; name: string }; types: LotType[]; teams: Team[]; readiness: Readiness[]; initialStates: Partial<Record<LotType, OrganizerLotState>> }) {
  const supabase = useMemo(() => createClient(), []);
  const reduceMotion = useReducedMotion();
  const [states, setStates] = useState(initialStates);
  const [activeType, setActiveType] = useState<LotType>(types[0]);
  const [teamOrder, setTeamOrder] = useState(teams.map((team) => team.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const requestKey = useRef<string | null>(null);
  const state = states[activeType];

  const refresh = useCallback(async (type = activeType, sessionId = states[type]?.session.id) => {
    if (!sessionId) return;
    const { data, error: rpcError } = await supabase.rpc('get_lot_organizer_state', { p_lot_session_id: sessionId });
    if (rpcError) setError(safeLotError(rpcError.message));
    else if (data) setStates((current) => ({ ...current, [type]: data as unknown as OrganizerLotState }));
  }, [activeType, states, supabase]);

  // Only subscribe to realtime for operational sessions (not CANCELLED / COMPLETED historical ones)
  useEffect(() => {
    if (!state?.session.id || state.session.status === 'CANCELLED') return;
    let lastSequence = 0;
    const channel = supabase.channel(`lot-organizer-${state.session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lot_public_events', filter: `lot_session_id=eq.${state.session.id}` }, (message) => {
        const sequence = Number((message.new as { sequence_number?: number }).sequence_number ?? 0);
        if (lastSequence && sequence > lastSequence + 1) setError('Realtime reconnected after missing an update. State was refreshed.');
        lastSequence = Math.max(lastSequence, sequence);
        if (!reveal) void refresh(activeType, state.session.id);
      })
      .subscribe((status) => { if (status === 'SUBSCRIBED') void refresh(activeType, state.session.id); });
    return () => { void supabase.removeChannel(channel); };
  }, [activeType, refresh, reveal, state?.session.id, state?.session.status, supabase]);

  const run = async (operation: () => Promise<{ error: { message: string } | null }>, after?: () => Promise<void>) => {
    setBusy(true); setError('');
    const result = await operation();
    if (result.error) setError(safeLotError(result.error.message)); else await after?.();
    setBusy(false);
  };

  const moveTeam = (index: number, delta: number) => setTeamOrder((current) => {
    const next = [...current]; const target = index + delta;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  });

  const prepare = async () => {
    setBusy(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('prepare_lot_session', { p_tournament_id: tournament.id, p_lot_type: activeType, p_team_order: teamOrder });
    if (rpcError) setError(safeLotError(rpcError.message)); else if (data) await refresh(activeType, data);
    setBusy(false);
  };

  const shuffle = async () => {
    if (!state) return;
    for (const number of [3, 2, 1]) { setCountdown(number); await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 50 : 600)); }
    setCountdown(null);
    await run(async () => await supabase.rpc('shuffle_lot_session', { p_lot_session_id: state.session.id }), () => refresh(activeType, state.session.id));
  };

  const selectCard = async (cardNumber: number) => {
    const turn = state?.turns.find((item) => item.status === 'ACTIVE');
    if (!state || !turn || busy || reveal) return;
    requestKey.current ??= crypto.randomUUID();
    setBusy(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('select_lot', { p_lot_session_id: state.session.id, p_lot_number: cardNumber, p_expected_turn_id: turn.id, p_request_key: requestKey.current });
    if (rpcError) { setError(safeLotError(rpcError.message)); await refresh(activeType, state.session.id); }
    else if (data) { setReveal(data as unknown as Reveal); requestKey.current = null; }
    setBusy(false);
  };

  const selectedCount = state?.cards.filter((card) => card.status === 'SELECTED').length ?? state?.turns.filter((turn) => turn.status === 'COMPLETED').length ?? 0;
  const total = state?.cards.length || state?.turns.length || 0;
  const activeTurn = state?.turns.find((turn) => turn.status === 'ACTIVE');
  const currentTeam = teams.find((team) => team.id === activeTurn?.team_id);
  const ready = readiness.find((item) => item.key === `${activeType}_LOT`);

  // Detect a dead-end cancelled session: CANCELLED with zero selections — show restart path
  const isCancelledWithNoSelections = state?.session.status === 'CANCELLED' && selectedCount === 0;
  // Show the "no session yet" preparation form when there's no active/operational session
  const showPrepareForm = !state || isCancelledWithNoSelections;

  const body = (
    <div className={presentation ? 'min-h-screen bg-background p-4 text-text-primary sm:p-8' : 'space-y-6'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-primary">{lotLabel(activeType)}</p><h1 className="mt-1 text-2xl font-extrabold sm:text-4xl">{tournament.name}</h1>{activeTurn && <p className="mt-2 text-text-secondary">Round {activeTurn.round_number} · Pick {selectedCount + 1} of {total}</p>}</div>
        {state && !isCancelledWithNoSelections && <button type="button" onClick={() => setPresentation(!presentation)} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-primary">{presentation ? <X size={18}/> : <Expand size={18}/>} {presentation ? 'Exit Presentation' : 'Full Screen Lot Draw'}</button>}
      </div>
      {error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      {/* ── Cancelled dead-end banner ── */}
      {isCancelledWithNoSelections && (
        <section aria-label="Cancelled lot session" className="rounded-2xl border border-danger/30 bg-danger/10 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Ban size={22} className="shrink-0 text-danger" />
            <div>
              <p className="font-bold text-danger">{lotLabel(activeType)} — Session Cancelled</p>
              {state.session.cancellation_reason && (
                <p className="mt-1 text-sm text-text-secondary">Reason: {state.session.cancellation_reason}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-text-secondary">The cancelled session is preserved for audit history. A brand-new session will be created.</p>
        </section>
      )}

      {activeTurn && <section className="rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center"><p className="text-xs font-black tracking-[.25em] text-primary">NOW PICKING</p><h2 className="mt-2 text-3xl font-black sm:text-5xl">{currentTeam?.name ?? 'Team'}</h2><p className="mt-2 text-text-secondary">Round {activeTurn.round_number} · Pick {selectedCount + 1}</p></section>}

      {/* ── Prepare form: shown for brand-new (no session) OR cancelled-with-no-selections ── */}
      {showPrepareForm && (
        <section className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xl font-bold">Confirm team order</h2>
            <p className="mt-1 text-sm text-text-secondary">This order repeats across capacity-safe rounds.</p>
            <ol className="mt-4 space-y-2">{teamOrder.map((id, index) => { const team = teams.find((item) => item.id === id)!; return <li key={id} className="flex items-center gap-3 rounded-xl bg-surface-muted p-3"><span className="w-7 font-bold text-primary">{index + 1}</span><span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span><button aria-label={`Move ${team.name} up`} disabled={index === 0} onClick={() => moveTeam(index, -1)} className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"><ArrowUp size={18}/></button><button aria-label={`Move ${team.name} down`} disabled={index === teamOrder.length - 1} onClick={() => moveTeam(index, 1)} className="rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-30"><ArrowDown size={18}/></button></li>; })}</ol>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-xl font-bold">Readiness</h2>
            <p className={`mt-3 font-bold ${ready?.status === 'READY' ? 'text-success' : 'text-warning'}`}>{ready?.status ?? 'BLOCKED'}</p>
            {ready?.issues?.map((issue) => <p key={issue} className="mt-2 text-sm text-text-secondary">• {issue}</p>)}
            <button
              id={`start-new-lot-${activeType.toLowerCase()}`}
              onClick={prepare}
              disabled={busy || ready?.status !== 'READY' || !teamOrder.length}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground disabled:opacity-40"
            >
              <Plus size={18}/>
              {busy ? 'Preparing…' : isCancelledWithNoSelections ? `Start New ${activeType === 'ICON' ? 'Icon' : 'Setter'} Lot` : 'Prepare Lot'}
            </button>
          </div>
        </section>
      )}

      {state?.session.status === 'PREPARING' && <section className="space-y-5"><div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm"><LockKeyhole className="mr-2 inline" size={18}/>Once shuffled, the card mapping is locked. Restarting requires cancellation with a reason.</div><div><h2 className="text-xl font-bold">Eligible player pool</h2><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{state.eligible_players.map((player) => <PlayerCard key={player.id} player={player} classification={activeType === 'ICON' ? 'ICON_LOT' : 'SETTER_LOT'} />)}</div></div><button onClick={shuffle} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground"><Shuffle size={18}/>{countdown ? `Shuffling in ${countdown}` : 'Confirm & Shuffle'}</button></section>}
      {state?.session.status === 'SHUFFLED' && <section className="text-center"><p className="mb-5 text-text-secondary">Cards are anonymously shuffled and locked.</p><button onClick={() => run(async () => await supabase.rpc('start_lot_session', { p_lot_session_id: state.session.id }), () => refresh(activeType, state.session.id))} disabled={busy} className="rounded-xl bg-primary px-8 py-4 text-lg font-black text-primary-foreground">Start Lot Draw</button></section>}
      {state && ['SHUFFLED','LIVE','COMPLETED'].includes(state.session.status) && <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">{state.cards.map((card) => <button key={card.lot_number} type="button" aria-label={`Card ${card.lot_number}, ${card.status.toLowerCase()}`} disabled={card.status !== 'AVAILABLE' || state.session.status !== 'LIVE' || busy || !!reveal} onClick={() => selectCard(card.lot_number)} className="aspect-[3/4] rounded-xl border border-primary/30 bg-primary/10 p-2 text-2xl font-black shadow-card transition focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-45">{card.status === 'SELECTED' ? '✓' : card.lot_number}</button>)}</div>}
      {state?.session.status === 'COMPLETED' && <section className="rounded-2xl border border-success/30 bg-success/10 p-8 text-center"><h2 className="text-3xl font-black">{activeType} PLAYER LOT COMPLETE</h2><p className="mt-2">{selectedCount} players allocated · {teams.length} teams</p><button onClick={() => setPresentation(false)} className="mt-5 rounded-xl border border-border px-5 py-2 font-bold">View Results</button></section>}
      {state && selectedCount === 0 && ['PREPARING','SHUFFLED','LIVE'].includes(state.session.status) && <button onClick={() => setCancelOpen(true)} className="text-sm font-semibold text-danger underline underline-offset-4">Cancel session</button>}
    </div>
  );

  return <main className="mx-auto max-w-7xl p-4 sm:p-6 md:p-10"><div className="mb-6 flex gap-2 overflow-x-auto">{types.map((type) => <button key={type} onClick={() => { setActiveType(type); setPresentation(false); }} className={`shrink-0 rounded-xl px-4 py-2 font-bold ${activeType === type ? 'bg-primary text-primary-foreground' : 'bg-surface text-text-secondary'}`}>{lotLabel(type)} · {states[type]?.session.status ?? 'Not Started'}</button>)}</div>{presentation ? <div className="fixed inset-0 z-[100] overflow-y-auto">{body}</div> : body}<AnimatePresence>{reveal && <motion.div role="dialog" aria-modal="true" aria-label="Player revealed" initial={reduceMotion ? false : { opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/85 p-4"><div className="w-full max-w-sm"><p className="mb-3 text-center text-sm font-black tracking-[.2em] text-primary">AUTHORITATIVE REVEAL</p><PlayerCard player={reveal.player} classification={activeType === 'ICON' ? 'ICON_LOT' : 'SETTER_LOT'} /><p className="mt-3 text-center text-lg font-bold text-primary-foreground">Assigned to {teams.find((team) => team.id === reveal.team_id)?.name ?? 'team'}</p><button onClick={async () => { const sessionId = state!.session.id; setReveal(null); await refresh(activeType, sessionId); }} className="mt-4 w-full rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Next Turn</button></div></motion.div>}</AnimatePresence>{cancelOpen && state && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4"><div className="w-full max-w-md rounded-2xl bg-surface p-6"><h2 className="text-xl font-bold">Cancel session?</h2><p className="mt-2 text-sm text-text-secondary">This session remains in history. A new session is required to restart.</p><label className="mt-4 block text-sm font-semibold">Reason<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3" /></label><div className="mt-4 flex gap-3"><button onClick={() => setCancelOpen(false)} className="flex-1 rounded-xl border border-border p-3">Keep session</button><button disabled={!cancelReason.trim() || busy} onClick={() => run(async () => await supabase.rpc('cancel_lot_session', { p_lot_session_id: state.session.id, p_reason: cancelReason }), async () => { await refresh(activeType, state.session.id); setCancelOpen(false); })} className="flex-1 rounded-xl bg-danger p-3 font-bold text-primary-foreground disabled:opacity-40">Cancel</button></div></div></div>}</main>;
}
