import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Choice } from '@/components/form';
import { Body, Button, Card, ErrorText, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';

type PlayerReg = { id: string; status: string; player_profiles: { display_name: string; primary_position: string | null; place: string | null } | null };
type TeamApp = { id: string; proposed_team_name: string; team_short_name: string | null; place: string | null; primary_color: string | null; secondary_color: string | null; status: string };
type Category = { id: string; category_code: string; display_name: string; base_price: number };

const ROUTES = [{ value: 'MAIN_AUCTION', label: 'Auction' }, { value: 'ICON_LOT', label: 'Icon lot' }, { value: 'SETTER_LOT', label: 'Setter lot' }] as const;
type Route = (typeof ROUTES)[number]['value'];

/** Pending registrations and team applications of one tournament, with approve and reject. */
export default function OrganizerTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [players, setPlayers] = useState<PlayerReg[] | null>(null);
  const [teams, setTeams] = useState<TeamApp[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [route, setRoute] = useState<Record<string, Route>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, t, c] = await Promise.all([
      api.from('player_tournament_registrations').select('id,status,player_profiles(display_name,primary_position,place)').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('team_owner_applications').select('id,proposed_team_name,team_short_name,place,primary_color,secondary_color,status').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('tournament_auction_categories').select('id,category_code,display_name,base_price').eq('tournament_id', id).order('display_order'),
    ]);
    const failure = p.error ?? t.error;
    if (failure) return setError(failure.message);
    setPlayers(p.data as unknown as PlayerReg[]);
    setTeams(t.data as unknown as TeamApp[]);
    setCategories((c.data as Category[]) ?? []);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function decide(key: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    setError(null);
    const { error: e } = await action();
    setBusy(null);
    if (e) setError(e.message); else await load();
  }

  if (!players || !teams) return <Screen>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  return (
    <Screen>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Heading>Player registrations</Heading>
      {players.length === 0 ? <Body muted>No registrations are waiting.</Body> : null}
      {players.map((r) => {
        const chosen = route[r.id];
        const needsPrice = chosen === 'MAIN_AUCTION' && categories.length > 0;
        return (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Heading small>{r.player_profiles?.display_name ?? 'Player'}</Heading>
              {r.status === 'CHANGES_REQUESTED' ? <StatusPill status="CHANGES_REQUESTED" /> : null}
            </View>
            <Body muted>{[r.player_profiles?.primary_position?.replace('_', ' ').toLowerCase(), r.player_profiles?.place].filter(Boolean).join(' · ')}</Body>
            <Choice label="Route" value={chosen ?? ''} options={[...ROUTES]} onChange={(v) => setRoute({ ...route, [r.id]: v })} />
            {needsPrice ? (
              <Choice label="Price category" value={price[r.id] ?? ''} options={categories.map((c) => ({ value: c.id, label: `${c.category_code} · ₹${c.base_price.toLocaleString('en-IN')}` }))} onChange={(v) => setPrice({ ...price, [r.id]: v })} />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button tone="danger" title="Reject" accessibilityLabel={`Reject ${r.player_profiles?.display_name}`} loading={busy === `r${r.id}`} disabled={busy !== null}
                  onPress={() => void decide(`r${r.id}`, () => api.rpc('reject_player_registration', { p_registration_id: r.id }))} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Approve" accessibilityLabel={`Approve ${r.player_profiles?.display_name}`} loading={busy === `a${r.id}`} disabled={busy !== null || !chosen || (needsPrice && !price[r.id])}
                  onPress={() => void decide(`a${r.id}`, () => api.rpc('approve_player_registration', { p_registration_id: r.id, p_auction_category: chosen, p_auction_price_category_id: needsPrice ? price[r.id] : undefined }))} />
              </View>
            </View>
          </Card>
        );
      })}

      <Heading>Team applications</Heading>
      {teams.length === 0 ? <Body muted>No applications are waiting.</Body> : null}
      {teams.map((a) => (
        <Card key={a.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {a.primary_color ? <View accessibilityLabel="Team colours" style={{ flexDirection: 'row', borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: '#9993' }}>
              <View style={{ width: 16, height: 16, backgroundColor: a.primary_color }} />
              {a.secondary_color ? <View style={{ width: 16, height: 16, backgroundColor: a.secondary_color }} /> : null}
            </View> : null}
            <Heading small>{a.proposed_team_name}</Heading>
          </View>
          <Body muted>{[a.team_short_name, a.place].filter(Boolean).join(' · ')}</Body>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button tone="danger" title="Reject" accessibilityLabel={`Reject ${a.proposed_team_name}`} loading={busy === `r${a.id}`} disabled={busy !== null}
                onPress={() => void decide(`r${a.id}`, () => api.rpc('reject_team_owner_application', { p_application_id: a.id }))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Approve" accessibilityLabel={`Approve ${a.proposed_team_name}`} loading={busy === `a${a.id}`} disabled={busy !== null}
                onPress={() => void decide(`a${a.id}`, () => api.rpc('approve_team_owner_application', { p_application_id: a.id }))} />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
