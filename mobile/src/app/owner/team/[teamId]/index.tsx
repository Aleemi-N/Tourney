import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AnnouncementsCard } from '@/components/announcements';
import { CheckInStrip } from '@/components/checkin';
import { OwnerPage, type OwnerTeam } from '@/components/owner';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, Tile } from '@/components/tournament';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Wallet = { starting_balance: number; spent_amount: number; remaining_balance: number };
type Match = { id: string; status: string; home_team_id: string | null; away_team_id: string | null; scheduled_at: string | null; court: string | null; home_team: { name: string } | null; away_team: { name: string } | null };
const money = (n: number | null | undefined) => `₹${Math.max(0, Number(n ?? 0)).toLocaleString('en-IN')}`;

/** Team overview: purse, squad size and upcoming matches. */
export default function OwnerTeamOverview() {
  return <OwnerPage tab="index" title="Team overview">{(team) => <Overview team={team} />}</OwnerPage>;
}

function Overview({ team }: { team: OwnerTeam }) {
  const t = useTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [squad, setSquad] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [next, setNext] = useState<Match[]>([]);

  useEffect(() => {
    (async () => {
      const [w, s, set, m] = await Promise.all([
        api.from('auction_team_wallets').select('starting_balance,spent_amount,remaining_balance').eq('team_id', team.id).maybeSingle(),
        api.from('team_players').select('id', { count: 'exact', head: true }).eq('team_id', team.id).eq('status', 'ACTIVE'),
        api.from('tournament_settings').select('max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle(),
        api.from('matches').select('id,status,home_team_id,away_team_id,scheduled_at,court,home_team:teams!matches_home_team_id_fkey(name),away_team:teams!matches_away_team_id_fkey(name)').or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).in('status', ['SCHEDULED', 'LIVE']).order('scheduled_at', { nullsFirst: false }).limit(3),
      ]);
      setWallet(w.data as Wallet | null);
      setSquad(s.count ?? 0);
      setMax((set.data?.max_squad_size as number | null | undefined) ?? null);
      setNext((m.data as unknown as Match[]) ?? []);
    })();
  }, [team]);

  const stat = (label: string, value: string) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 140, padding: 16, gap: 2 }]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>{value}</Text>
    </View>
  );

  return (
    <>
      <View style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 14, borderLeftWidth: 6, borderLeftColor: team.primary_color ?? t.primary }]}>
        <Tile label={(team.short_name ?? team.name).slice(0, 3).toUpperCase()} color={team.primary_color} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{team.name}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>{[team.place, team.tournament_name].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {stat('Squad', squad === null ? '—' : `${squad}${max ? ` / ${max}` : ''}`)}
        {wallet ? stat('Purse left', money(wallet.remaining_balance)) : null}
        {wallet ? stat('Spent', money(wallet.spent_amount)) : null}
      </View>
      <AnnouncementsCard tournamentId={team.tournament_id} />
      <Section title="Next matches">
        {next.length === 0 ? <Empty text="No upcoming matches yet." /> : next.map((m) => (
          <View key={m.id} style={portalCard(t)}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{m.home_team?.name ?? 'TBD'} <Text style={{ color: t.textMuted, fontWeight: '500' }}>vs</Text> {m.away_team?.name ?? 'TBD'}</Text>
            {m.status === 'SCHEDULED' && m.home_team_id && m.away_team_id ? <CheckInStrip matchId={m.id} teams={[{ id: m.home_team_id, name: m.home_team?.name ?? 'Home' }, { id: m.away_team_id, name: m.away_team?.name ?? 'Away' }]} canAct={[team.id]} scheduledAt={m.scheduled_at} /> : null}
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Time to be announced'}{m.court ? ` · Court ${m.court}` : ''}</Text>
          </View>
        ))}
      </Section>
    </>
  );
}
