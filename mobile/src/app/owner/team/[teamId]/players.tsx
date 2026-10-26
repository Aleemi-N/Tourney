import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Choice } from '@/components/form';
import { OwnerPage, type OwnerTeam } from '@/components/owner';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, positionTone } from '@/components/tournament';
import { Loading, Pill } from '@/components/ui';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type Reg = { player_id: string; player_profiles: { display_name: string; primary_position: string | null; place: string | null; height_cm: number | null } | null };
type Owned = { player_id: string; team_id: string; acquisition_amount: number | null; teams: { name: string } | null };
type Entry = { name: string; position: string | null; place: string | null; height: number | null; status: 'SOLD' | 'LIVE' | 'AVAILABLE'; category: string | null; basePrice: number | null; soldTo: string | null; amount: number | null; mine: boolean };
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'available', label: 'Available' }, { value: 'sold', label: 'Sold' }, { value: 'mine', label: 'Mine' }] as const;
type Filter = (typeof FILTERS)[number]['value'];
const rupees = (n: number | null) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;

/** The approved player pool with each player's auction status. */
export default function OwnerPlayerPool() {
  return <OwnerPage tab="players" title="Player pool">{(team) => <Pool team={team} />}</OwnerPage>;
}

function Pool({ team }: { team: OwnerTeam }) {
  const t = useTheme();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    (async () => {
      const [regs, auction, squads] = await Promise.all([
        api.from('player_tournament_registrations').select('player_id,player_profiles(display_name,primary_position,place,height_cm)').eq('tournament_id', team.tournament_id).eq('status', 'APPROVED'),
        api.from('auctions').select('id').eq('tournament_id', team.tournament_id).maybeSingle(),
        api.from('team_players').select('player_id,team_id,acquisition_amount,teams(name)').eq('tournament_id', team.tournament_id).eq('status', 'ACTIVE'),
      ]);
      const owned = new Map(((squads.data ?? []) as unknown as Owned[]).map((r) => [r.player_id, r]));
      const aps = auction.data?.id
        ? (((await api.from('auction_players').select('player_id,status,category_code,base_price').eq('auction_id', auction.data.id as string)).data ?? []) as unknown as { player_id: string; status: string; category_code: string | null; base_price: number | null }[])
        : [];
      const apMap = new Map(aps.map((a) => [a.player_id, a]));
      setEntries(((regs.data ?? []) as unknown as Reg[]).filter((r) => r.player_profiles).map((r) => {
        const o = owned.get(r.player_id);
        const ap = apMap.get(r.player_id);
        const p = r.player_profiles!;
        return { name: p.display_name, position: p.primary_position, place: p.place, height: p.height_cm, status: o ? 'SOLD' : ap?.status === 'LIVE' ? 'LIVE' : 'AVAILABLE', category: ap?.category_code ?? null, basePrice: ap?.base_price ?? null, soldTo: o?.teams?.name ?? null, amount: o?.acquisition_amount ?? null, mine: o?.team_id === team.id };
      }));
    })();
  }, [team]);

  if (!entries) return <Loading />;
  const shown = entries.filter((e) => filter === 'all' || (filter === 'available' && e.status !== 'SOLD') || (filter === 'sold' && e.status === 'SOLD') || (filter === 'mine' && e.mine));
  return (
    <>
      <Choice label="Show" value={filter} options={[...FILTERS]} onChange={setFilter} />
      {shown.length === 0 ? <Empty text="No players match this filter." /> : shown.map((e) => {
        const tone = positionTone(e.position, t);
        const detail = e.status === 'SOLD' ? `${e.mine ? 'Your squad' : e.soldTo}${e.amount ? ` · ${rupees(e.amount)}` : ''}` : e.category ? `Category ${e.category}${e.basePrice ? ` · base ${rupees(e.basePrice)}` : ''}` : 'Not in the auction yet';
        return (
          <View key={e.name} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={{ width: 48, height: 48, borderRadius: radius.xl, backgroundColor: tint(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: tone, fontSize: 17, fontWeight: '800' }}>{e.name.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{e.name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{[e.position ? positionLabel(e.position) : null, e.place, e.height ? `${e.height} cm` : null].filter(Boolean).join(' · ')}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 12 }}>{detail}</Text>
            </View>
            <Pill label={e.status === 'SOLD' ? 'Sold' : e.status === 'LIVE' ? 'On the block' : 'Available'} tone={e.status === 'LIVE' ? 'live' : e.status === 'SOLD' ? 'success' : 'neutral'} />
          </View>
        );
      })}
    </>
  );
}
