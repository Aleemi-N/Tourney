import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { OwnerPage, type OwnerTeam } from '@/components/owner';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, Tile } from '@/components/tournament';
import { Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { tint, useTheme } from '@/theme';

type Snapshot = {
  auction?: { id: string; status: string };
  current_player?: { base_price: number; category_code: string | null; category_label: string | null; player: { display_name: string; primary_position: string | null; secondary_position: string | null } } | null;
  highest_bid?: { amount: number; team: { id: string; name: string; short_name: string | null } } | null;
  team?: { remaining_purse: number; spent_purse: number; active_squad: number; minimum_squad: number; maximum_squad: number; protected_reserve: number; max_allowed_bid: number; may_bid: boolean; blocked_reason: string | null };
  next_minimum_bid?: number;
};
const money = (n: number | null | undefined) => `₹${Math.max(0, Number(n ?? 0)).toLocaleString('en-IN')}`;
const BLOCKED: Record<string, string> = {
  PROTECTED_PURSE: 'Your usable purse must protect the remaining minimum-squad reserve.',
  AUCTION_NOT_LIVE: 'Bidding opens when the organizer starts the auction.',
  NO_LIVE_PLAYER: 'Waiting for the auctioneer to bring the next player.',
};

/** Follow the live auction for this team. The server state is re-read on every change signal. */
export default function OwnerAuction() {
  return <OwnerPage tab="auction" title="Live auction">{(team) => <Auction team={team} />}</OwnerPage>;
}

function Auction({ team }: { team: OwnerTeam }) {
  const t = useTheme();
  const [auctionId, setAuctionId] = useState<string | null | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [live, setLive] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    api.from('auctions').select('id').eq('tournament_id', team.tournament_id).maybeSingle().then(({ data }) => setAuctionId((data?.id as string | undefined) ?? null));
  }, [team]);

  const refresh = useCallback(async () => {
    if (!auctionId || busy.current) return;
    busy.current = true;
    const { data } = await api.rpc('get_auction_owner_state', { p_auction_id: auctionId, p_team_id: team.id });
    busy.current = false;
    if (data) setSnapshot(data as unknown as Snapshot);
  }, [auctionId, team.id]);

  useEffect(() => {
    if (!auctionId) return;
    void refresh();
    const channel = api.channel(`owner-auction-${auctionId}-${team.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_public_events', filter: `auction_id=eq.${auctionId}` }, () => void refresh())
      .subscribe((status) => { setLive(status === 'SUBSCRIBED'); if (status === 'SUBSCRIBED') void refresh(); });
    const appState = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { void api.removeChannel(channel); appState.remove(); };
  }, [auctionId, team.id, refresh]);

  if (auctionId === undefined) return <Loading />;
  if (auctionId === null) return <Empty text="Auction preparation is not available for this team yet." />;

  const player = snapshot?.current_player;
  const me = snapshot?.team;
  const leading = snapshot?.highest_bid?.team.id === team.id;
  const blocked = me?.blocked_reason ? BLOCKED[me.blocked_reason] ?? 'Your team cannot bid right now.' : me && !me.may_bid ? 'Your team cannot bid in the current state.' : null;
  const standing = blocked ? 'Cannot bid' : leading ? 'Leading' : snapshot?.highest_bid ? 'Outbid' : 'Ready to bid';

  const metric = (label: string, value: string, hi = false) => (
    <View key={label} style={{ flex: 1, minWidth: 130, gap: 2, padding: 12, borderRadius: 16, backgroundColor: hi ? tint(t.primary, 0.1) : t.surfaceMuted }}>
      <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: hi ? t.primary : t.text, fontSize: 18, fontWeight: '800' }}>{value}</Text>
    </View>
  );

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Pill label={live ? 'Live connected' : 'Reconnecting…'} tone={live ? 'success' : 'neutral'} />
        {snapshot?.auction ? <Pill label={snapshot.auction.status} tone={snapshot.auction.status === 'LIVE' ? 'live' : 'neutral'} /> : null}
      </View>

      <View style={[portalCard(t), { gap: 12 }]}>
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>On the block</Text>
        {player ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Tile label={player.player.display_name.slice(0, 2).toUpperCase()} size={64} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>{player.player.display_name}</Text>
                <Text style={{ color: t.textSecondary, fontSize: 14 }}>{player.player.primary_position ? positionLabel(player.player.primary_position) : 'Position pending'}{player.player.secondary_position ? ` / ${positionLabel(player.player.secondary_position)}` : ''}</Text>
                {player.category_code ? <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>Category {player.category_code}{player.category_label ? ` · ${player.category_label}` : ''}</Text> : null}
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {metric('Base price', money(player.base_price))}
              {metric('Highest bid', snapshot?.highest_bid ? money(snapshot.highest_bid.amount) : 'No bids')}
            </View>
            {snapshot?.highest_bid ? <Text style={{ color: leading ? t.success : t.textSecondary, fontSize: 14, fontWeight: '700' }}>{leading ? 'You are leading' : `Leading: ${snapshot.highest_bid.team.short_name ?? snapshot.highest_bid.team.name}`}</Text> : null}
          </>
        ) : <Text style={{ color: t.textSecondary, fontSize: 15 }}>Waiting for the auctioneer to bring the next player.</Text>}
      </View>

      {me ? (
        <View style={[portalCard(t), { gap: 12 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{team.name} finances</Text>
            <Pill label={standing} tone={leading ? 'success' : blocked ? 'live' : 'neutral'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {metric('Remaining purse', money(me.remaining_purse))}
            {metric('Total spent', money(me.spent_purse))}
            {metric('Min-squad reserve', money(me.protected_reserve))}
            {metric('Max bid allowed', money(me.max_allowed_bid), true)}
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>Squad capacity</Text>
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '700' }}>{me.active_squad} / {me.maximum_squad} (min {me.minimum_squad})</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceMuted, overflow: 'hidden' }}>
              <View style={{ height: 8, width: `${Math.min(100, (me.active_squad / Math.max(me.maximum_squad, 1)) * 100)}%`, backgroundColor: t.primary }} />
            </View>
          </View>
          {snapshot?.next_minimum_bid ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>Next minimum bid: {money(snapshot.next_minimum_bid)}</Text> : null}
          {blocked ? <Text style={{ color: t.warning, fontSize: 13, fontWeight: '600' }}>{blocked}</Text> : null}
        </View>
      ) : null}
    </>
  );
}
