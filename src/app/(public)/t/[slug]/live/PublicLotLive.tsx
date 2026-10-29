'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { createClient } from '@/lib/api/client';
import { PlayerCard } from '@/components/player/PlayerCard';
import { lotLabel, type PublicLotState } from '@/lib/lot-draw';

export function PublicLotLive({ tournament, teams, initialState }: { tournament: { id: string; name: string; slug: string }; teams: Array<{ id: string; name: string; short_name: string | null }>; initialState: PublicLotState | null }) {
  const api = useMemo(() => createClient(), []);
  const reduceMotion = useReducedMotion();
  const [state, setState] = useState(initialState);
  const [justRevealed, setJustRevealed] = useState<number | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const refresh = useCallback(async (sessionId?: string) => {
    let id = sessionId ?? state?.session.id;
    if (!id) {
      const { data } = await api.from('lot_public_events').select('lot_session_id').eq('tournament_id', tournament.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      id = data?.lot_session_id;
    }
    if (!id) return;
    const { data } = await api.rpc('get_lot_public_state', { p_lot_session_id: id });
    if (data) setState(data as unknown as PublicLotState);
  }, [state?.session.id, api, tournament.id]);
  useEffect(() => {
    let lastSequence = state?.last_sequence ?? 0;
    const channel = api.channel(`lot-public-${tournament.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lot_public_events', filter: `tournament_id=eq.${tournament.id}` }, (message) => {
      const event = message.new as { lot_session_id: string; sequence_number: number; event_type: string; card_number: number | null };
      if (event.sequence_number > lastSequence + 1) setConnection('reconnecting');
      lastSequence = event.sequence_number;
      if (event.event_type === 'PLAYER_SELECTED') setJustRevealed(event.card_number);
      void refresh(event.lot_session_id);
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') { setConnection('live'); void refresh(); }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('reconnecting');
    });
    return () => { void api.removeChannel(channel); };
  }, [refresh, state?.last_sequence, api, tournament.id]);
  useEffect(() => {
    if (!state || !['PREPARING', 'SHUFFLED', 'LIVE'].includes(state.session.status)) return;
    const recoveryPoll = window.setInterval(() => void refresh(state.session.id), 5000);
    const recoverWhenVisible = () => { if (document.visibilityState === 'visible') void refresh(state.session.id); };
    document.addEventListener('visibilitychange', recoverWhenVisible);
    window.addEventListener('online', recoverWhenVisible);
    return () => {
      window.clearInterval(recoveryPoll);
      document.removeEventListener('visibilitychange', recoverWhenVisible);
      window.removeEventListener('online', recoverWhenVisible);
    };
  }, [refresh, state]);
  if (!state || state.session.status === 'CANCELLED') return <section className="py-24 text-center"><Radio className="mx-auto mb-4 text-primary" size={42}/><h1 className="text-3xl font-black">Nothing is live right now</h1><p className="mt-3 text-text-secondary">{tournament.name} updates will appear here when a Lot Draw begins.</p></section>;
  const selected = state.cards.filter((card) => card.status === 'SELECTED');
  const currentTeam = teams.find((team) => team.id === state.current_turn?.team_id);
  return <section className="py-8"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.22em] text-primary">Live · {lotLabel(state.session.lot_type)}</p><h1 className="mt-2 text-3xl font-black sm:text-5xl">{tournament.name}</h1></div><span className="rounded-full border border-border px-3 py-1 text-xs text-text-secondary">{connection === 'live' ? '● Connected' : '↻ Reconnecting'}</span></header>{state.current_turn && <div className="my-8 rounded-2xl border border-primary/30 bg-primary/10 p-6 text-center"><p className="text-xs font-black tracking-[.24em] text-primary">NOW PICKING</p><h2 className="mt-2 text-3xl font-black sm:text-5xl">{currentTeam?.name ?? 'Team'}</h2><p className="mt-2 text-text-secondary">Round {state.current_turn.round_number} · Pick {selected.length + 1}</p></div>}<div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">{state.cards.map((card) => <div key={card.lot_number} aria-label={`Card ${card.lot_number}, ${card.status.toLowerCase()}`} className={`grid aspect-[3/4] place-items-center rounded-xl border border-primary/30 bg-primary/10 text-2xl font-black text-primary ${card.status === 'SELECTED' ? 'opacity-45' : ''}`}>{card.status === 'SELECTED' ? '✓' : card.lot_number}</div>)}</div>{selected.length > 0 && <div className="mt-10"><h2 className="text-2xl font-black">Revealed players</h2><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{selected.map((card) => card.player && <motion.div key={card.lot_number} initial={!reduceMotion && justRevealed === card.lot_number ? { opacity: 0, rotateY: 90 } : false} animate={{ opacity: 1, rotateY: 0 }} onAnimationComplete={() => setJustRevealed(null)}><PlayerCard player={card.player} classification={state.session.lot_type === 'ICON' ? 'ICON_LOT' : 'SETTER_LOT'}><p className="text-xs font-bold">Card {card.lot_number} · {teams.find((team) => team.id === card.selected_by_team_id)?.name ?? 'Team'}</p></PlayerCard></motion.div>)}</div></div>}{state.session.status === 'COMPLETED' && <div className="mt-10 rounded-2xl border border-success/30 bg-success/10 p-8 text-center"><h2 className="text-3xl font-black">{state.session.lot_type} LOT COMPLETE</h2><p className="mt-2 text-text-secondary">{selected.length} players allocated</p></div>}</section>;
}
