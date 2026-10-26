import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard, Section } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, Tile } from '@/components/tournament';
import { Button, ErrorText, Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { availableActions, blockerMessage, money, safeAuctionError, type Snapshot, type Readiness } from '@/lib/auction';
import { requestKey } from '@/lib/lot';
import { tint, useTheme } from '@/theme';

type TeamName = { id: string; name: string; short_name: string | null };
type Confirm = { kind: 'sold' | 'unsold' | 'requeue' | 'complete'; text: string } | null;

/** Auction control: prepare, start, open players, take bids for teams, sell, and finish. */
export default function OrganizerAuction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [enabled, setEnabled] = useState<boolean | undefined>(undefined);
  const [auctionId, setAuctionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [teams, setTeams] = useState<TeamName[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [increment, setIncrement] = useState(0);
  const [bids, setBids] = useState<Record<string, string>>({});
  const [requeuePrice, setRequeuePrice] = useState('');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const loading = useRef(false);

  const load = useCallback(async (aid: string | null) => {
    if (loading.current) return;
    loading.current = true;
    if (aid) {
      const { data } = await api.rpc('get_auction_organizer_state', { p_auction_id: aid });
      if (data) setSnapshot(data as unknown as Snapshot);
    } else {
      const { data } = await api.rpc('get_auction_readiness', { p_tournament_id: id });
      if (data) setReadiness(data as unknown as Readiness);
    }
    loading.current = false;
  }, [id]);

  useEffect(() => {
    (async () => {
      const [tn, auction, tm, settings] = await Promise.all([
        api.from('tournaments').select('format,league_mode').eq('id', id).maybeSingle(),
        api.from('auctions').select('id').eq('tournament_id', id).maybeSingle(),
        api.from('teams').select('id,name,short_name').eq('tournament_id', id).eq('status', 'ACTIVE'),
        api.from('tournament_settings').select('auction_bid_increment').eq('tournament_id', id).maybeSingle(),
      ]);
      const isAuction = tn.data?.format === 'LEAGUE' && tn.data?.league_mode === 'AUCTION';
      setEnabled(isAuction);
      setTeams((tm.data ?? []) as TeamName[]);
      setIncrement(Number(settings.data?.auction_bid_increment ?? 0));
      const aid = (auction.data?.id as string | undefined) ?? null;
      setAuctionId(aid);
      if (isAuction) await load(aid);
    })();
  }, [id, load]);

  useEffect(() => {
    if (!snapshot?.queue?.length) return;
    const ids = snapshot.queue.map((q) => q.player_id);
    api.from('player_profiles').select('id,display_name').in('id', ids).then(({ data }) => setNames(Object.fromEntries(((data ?? []) as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]))));
  }, [snapshot?.queue]);

  useEffect(() => {
    if (!auctionId) return;
    const channel = api.channel(`organizer-auction-${auctionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_public_events', filter: `auction_id=eq.${auctionId}` }, () => void load(auctionId))
      .subscribe((status) => { setLive(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') void load(auctionId); });
    const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void load(auctionId); });
    return () => { void api.removeChannel(channel); appState.remove(); };
  }, [auctionId, load]);

  async function run(action: () => PromiseLike<{ error: { message: string } | null; data?: unknown }>) {
    setBusy(true); setError(null);
    const { error: e } = await action();
    setBusy(false);
    setConfirm(null);
    if (e) setError(safeAuctionError(e.message));
    await load(auctionId);
  }

  async function prepare() {
    setBusy(true); setError(null);
    const { data, error: e } = await api.rpc('prepare_auction', { p_tournament_id: id });
    setBusy(false);
    if (e) return setError(safeAuctionError(e.message));
    const { data: a } = await api.from('auctions').select('id').eq('tournament_id', id).maybeSingle();
    const aid = (a?.id as string | undefined) ?? ((data as { auction_id?: string } | null)?.auction_id ?? null);
    setAuctionId(aid);
    await load(aid);
  }

  const act = availableActions(snapshot);
  const cur = snapshot?.current_player;
  const top = snapshot?.highest_bid;
  const teamName = (teamId: string) => teams.find((x) => x.id === teamId)?.name ?? 'Team';
  const nextMin = cur ? (top ? top.amount + increment : cur.base_price) : 0;
  const version = snapshot?.auction.state_version ?? 0;

  const lifecycle = (action: 'START' | 'PAUSE' | 'RESUME') => run(() => api.rpc('set_auction_lifecycle', { p_auction_id: auctionId!, p_action: action, p_expected_version: version, p_request_key: requestKey() }));

  return (
    <OrganizerFrame id={id} current="auction" title="Auction Control" subtitle={name}>
      {enabled === undefined ? <Loading /> : enabled === false ? (
        <View style={portalCard(t)}><Text style={{ color: t.textSecondary, fontSize: 15 }}>Auction is not configured. This tournament is not in Auction League mode.</Text></View>
      ) : (
        <>
          {error ? <ErrorText>{error}</ErrorText> : null}

          {!snapshot ? (
            <View style={[portalCard(t), { gap: 10 }]}>
              <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Readiness</Text>
              <Text style={{ color: readiness?.ready ? t.success : t.warning, fontSize: 16, fontWeight: '800' }}>{readiness ? (readiness.ready ? 'READY' : 'BLOCKED') : 'Checking…'}</Text>
              {readiness ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>{readiness.active_teams} teams · {readiness.eligible_players} players · {readiness.remaining_capacity} open squad slots</Text> : null}
              {readiness?.blockers.map((b) => <Text key={b} style={{ color: t.textSecondary, fontSize: 13 }}>• {blockerMessage(b)}</Text>)}
              <Button title="Prepare Auction" loading={busy} disabled={busy || !readiness?.ready} onPress={() => void prepare()} />
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <Pill label={snapshot.auction.status} tone={snapshot.auction.status === 'LIVE' ? 'live' : 'neutral'} />
                <Pill label={live ? 'Live connected' : 'Reconnecting…'} tone={live ? 'success' : 'neutral'} />
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>{snapshot.progress.waiting} waiting · {snapshot.progress.sold} sold · {snapshot.progress.unsold} unsold</Text>
              </View>

              <View style={{ gap: 10 }}>
                {act.canPrepare ? <Button tone="secondary" title="Re-prepare Auction" disabled={busy} onPress={() => void prepare()} /> : null}
                {act.canStart ? <Button title="Start Auction" loading={busy} onPress={() => void lifecycle('START')} /> : null}
                {act.canPause ? <Button tone="secondary" title="Pause Auction" disabled={busy} onPress={() => void lifecycle('PAUSE')} /> : null}
                {act.canResume ? <Button title="Resume Auction" loading={busy} onPress={() => void lifecycle('RESUME')} /> : null}
                {act.canOpenNext ? <Button title="Open Next Player" loading={busy} onPress={() => void run(() => api.rpc('open_next_auction_player', { p_auction_id: auctionId!, p_expected_version: version, p_request_key: requestKey(), p_target_auction_player_id: null as unknown as string }))} /> : null}
              </View>

              <View style={[portalCard(t), { gap: 12, borderColor: cur ? t.primary : t.border }]}>
                <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>On the block</Text>
                {cur ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                      <Tile label={cur.player.display_name.slice(0, 2).toUpperCase()} size={60} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{cur.player.display_name}</Text>
                        <Text style={{ color: t.textSecondary, fontSize: 14 }}>{cur.player.primary_position ? positionLabel(cur.player.primary_position) : 'Position pending'}</Text>
                        <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>{cur.category_code ? `Category ${cur.category_code} · ` : ''}Base {money(cur.base_price)}{cur.attempt_number > 1 ? ` · Attempt ${cur.attempt_number}` : ''}</Text>
                      </View>
                    </View>
                    <View style={{ backgroundColor: tint(t.primary, 0.08), borderRadius: 16, padding: 14, gap: 2 }}>
                      <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>HIGHEST BID</Text>
                      <Text style={{ color: t.text, fontSize: 28, fontWeight: '900' }}>{top ? money(top.amount) : 'No bids'}</Text>
                      {top ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>{top.team.name}</Text> : null}
                    </View>
                  </>
                ) : <Text style={{ color: t.textSecondary, fontSize: 15 }}>{snapshot.auction.status === 'COMPLETED' ? 'The auction is complete.' : 'No player is open for bidding.'}</Text>}
              </View>

              {cur && snapshot.auction.status === 'LIVE' ? (
                <Section title={`Bids · next minimum ${money(nextMin)}`}>
                  {snapshot.teams.map((w) => {
                    const amount = bids[w.team_id] ?? String(nextMin);
                    const value = Number(amount);
                    const leading = top?.team.id === w.team_id;
                    const over = value > w.finance.max_allowed_bid;
                    const bad = !Number.isFinite(value) || value < nextMin || over || leading;
                    return (
                      <View key={w.team_id} style={[portalCard(t), { gap: 10 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700' }}>{teamName(w.team_id)}</Text>
                          {leading ? <Pill label="Leading" tone="success" /> : null}
                        </View>
                        <Text style={{ color: t.textSecondary, fontSize: 12 }}>Purse {money(w.finance.remaining)} · max bid {money(w.finance.max_allowed_bid)} · squad {w.finance.active_squad}/{w.finance.maximum_squad}</Text>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
                          <View style={{ flex: 1 }}><Field label="Amount (₹)" value={amount} onChangeText={(v) => setBids({ ...bids, [w.team_id]: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" /></View>
                          <Button title="Bid" accessibilityLabel={`Place bid for ${teamName(w.team_id)}`} disabled={busy || bad}
                            onPress={() => void run(() => api.rpc('place_auction_bid', { p_auction_id: auctionId!, p_auction_player_id: cur.auction_player_id, p_team_id: w.team_id, p_amount: value, p_request_key: requestKey(), p_expected_player_version: cur.state_version, p_expected_highest_bid: top?.amount ?? 0 }))} />
                        </View>
                        {over ? <Text style={{ color: t.warning, fontSize: 12 }}>Above this team's maximum allowed bid.</Text> : null}
                      </View>
                    );
                  })}
                </Section>
              ) : null}

              {cur && (act.canSold || act.canUnsold) ? (
                <View style={{ gap: 10 }}>
                  {confirm?.kind === 'sold' || confirm?.kind === 'unsold' ? (
                    <View style={[portalCard(t), { gap: 10 }]}>
                      <Text style={{ color: t.text, fontSize: 15 }}>{confirm.text}</Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setConfirm(null)} /></View>
                        <View style={{ flex: 1 }}><Button title="Confirm" loading={busy} onPress={() => void (confirm.kind === 'sold'
                          ? run(() => api.rpc('finalize_auction_sale', { p_auction_id: auctionId!, p_auction_player_id: cur.auction_player_id, p_expected_player_version: cur.state_version, p_expected_winning_bid_id: top!.id, p_request_key: requestKey() }))
                          : run(() => api.rpc('mark_auction_player_unsold', { p_auction_id: auctionId!, p_auction_player_id: cur.auction_player_id, p_expected_player_version: cur.state_version, p_request_key: requestKey() })))} /></View>
                      </View>
                    </View>
                  ) : (
                    <>
                      {act.canSold && top ? <Button title={`Sold to ${top.team.name} for ${money(top.amount)}`} disabled={busy} onPress={() => setConfirm({ kind: 'sold', text: `Sell ${cur.player.display_name} to ${top.team.name} for ${money(top.amount)}? This cannot be undone.` })} /> : null}
                      {act.canUnsold ? <Button tone="danger-outline" title="Mark Unsold" disabled={busy} onPress={() => setConfirm({ kind: 'unsold', text: `Mark ${cur.player.display_name} unsold?` })} /> : null}
                    </>
                  )}
                </View>
              ) : null}

              {snapshot.queue.some((q) => q.status === 'UNSOLD') ? (
                <Section title="Unsold players">
                  <Field label="New price for re-auction (optional, ₹)" value={requeuePrice} onChangeText={(v) => setRequeuePrice(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
                  {snapshot.queue.filter((q) => q.status === 'UNSOLD').map((q) => (
                    <View key={q.auction_player_id} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{names[q.player_id] ?? 'Player'}</Text>
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>{q.category_code ? `Category ${q.category_code} · ` : ''}Base {money(q.base_price)} · attempt {q.attempt_number}</Text>
                      </View>
                      <Button tone="secondary" title="Re-auction" accessibilityLabel={`Re-auction ${names[q.player_id] ?? 'player'}`} disabled={busy || snapshot.auction.status === 'COMPLETED'}
                        onPress={() => void run(() => api.rpc('requeue_auction_player', { p_auction_id: auctionId!, p_auction_player_id: q.auction_player_id, p_expected_player_version: q.state_version, p_request_key: requestKey(), p_new_price: (requeuePrice ? Number(requeuePrice) : undefined) as number }))} />
                    </View>
                  ))}
                </Section>
              ) : null}

              <Section title="Queue">
                {snapshot.queue.filter((q) => q.status === 'WAITING').length === 0 ? <Empty text="No players are waiting." /> : snapshot.queue.filter((q) => q.status === 'WAITING').slice(0, 12).map((q) => (
                  <View key={q.auction_player_id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 6 }}>
                    <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{q.auction_order}. {names[q.player_id] ?? 'Player'}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 13 }}>{q.category_code ? `${q.category_code} · ` : ''}{money(q.base_price)}</Text>
                  </View>
                ))}
              </Section>

              <Section title="Team purses">
                {snapshot.teams.map((w) => (
                  <View key={w.team_id} style={[portalCard(t), { gap: 2 }]}>
                    <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{teamName(w.team_id)}</Text>
                    <Text style={{ color: t.textSecondary, fontSize: 13 }}>Remaining {money(w.finance.remaining)} · spent {money(w.finance.spent)} · squad {w.finance.active_squad}/{w.finance.maximum_squad} (min {w.finance.minimum_squad})</Text>
                  </View>
                ))}
              </Section>

              {act.canComplete ? (
                confirm?.kind === 'complete' ? (
                  <View style={[portalCard(t), { gap: 10 }]}>
                    <Text style={{ color: t.text, fontSize: 15 }}>Complete the auction? No more bids or sales are possible after this.</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setConfirm(null)} /></View>
                      <View style={{ flex: 1 }}><Button title="Complete" loading={busy} onPress={() => void run(() => api.rpc('complete_auction', { p_auction_id: auctionId!, p_expected_version: version, p_request_key: requestKey() }))} /></View>
                    </View>
                  </View>
                ) : <Button title="Complete Auction" disabled={busy} onPress={() => setConfirm({ kind: 'complete', text: '' })} />
              ) : null}
            </>
          )}
        </>
      )}
    </OrganizerFrame>
  );
}
