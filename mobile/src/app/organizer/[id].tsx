import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice } from '@/components/form';
import { PortalShell, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, positionTone } from '@/components/tournament';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type PlayerReg = { id: string; status: string; player_profiles: { display_name: string; primary_position: string | null; place: string | null } | null };
type TeamApp = { id: string; proposed_team_name: string; team_short_name: string | null; place: string | null; primary_color: string | null; secondary_color: string | null; status: string };
type Category = { id: string; category_code: string; display_name: string; base_price: number };

const ROUTES = [{ value: 'MAIN_AUCTION', label: 'Auction' }, { value: 'ICON_LOT', label: 'Icon lot' }, { value: 'SETTER_LOT', label: 'Setter lot' }] as const;
type Route = (typeof ROUTES)[number]['value'];

/** Participant management for one tournament: players and team owners waiting for a decision. */
export default function OrganizerTournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [tab, setTab] = useState<'players' | 'owners'>('players');
  const [name, setName] = useState('');
  const [players, setPlayers] = useState<PlayerReg[] | null>(null);
  const [teams, setTeams] = useState<TeamApp[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [route, setRoute] = useState<Record<string, Route>>({});
  const [price, setPrice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, tm, c, info] = await Promise.all([
      api.from('player_tournament_registrations').select('id,status,player_profiles(display_name,primary_position,place)').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('team_owner_applications').select('id,proposed_team_name,team_short_name,place,primary_color,secondary_color,status').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('tournament_auction_categories').select('id,category_code,display_name,base_price').eq('tournament_id', id).order('display_order'),
      api.from('tournaments').select('name').eq('id', id).maybeSingle(),
    ]);
    const failure = p.error ?? tm.error;
    if (failure) return setError(failure.message);
    setName((info.data?.name as string | undefined) ?? '');
    setPlayers(p.data as unknown as PlayerReg[]);
    setTeams(tm.data as unknown as TeamApp[]);
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

  const tabButton = (value: 'players' | 'owners', label: string) => (
    <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)}
      style={{ paddingHorizontal: 18, minHeight: 44, borderRadius: radius.xl, justifyContent: 'center', backgroundColor: tab === value ? t.primary : 'transparent' }}>
      <Text style={{ color: tab === value ? t.primaryText : t.textSecondary, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  const decisionButtons = (reject: { key: string; label: string; run: () => PromiseLike<{ error: { message: string } | null }> }, approve: { key: string; label: string; disabled: boolean; run: () => PromiseLike<{ error: { message: string } | null }> }) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Button tone="danger-outline" title="Reject" accessibilityLabel={reject.label} loading={busy === reject.key} disabled={busy !== null} onPress={() => void decide(reject.key, reject.run)} /></View>
      <View style={{ flex: 1 }}><Button title="Approve" accessibilityLabel={approve.label} loading={busy === approve.key} disabled={busy !== null || approve.disabled} onPress={() => void decide(approve.key, approve.run)} /></View>
    </View>
  );

  return (
    <PortalShell role="Organizer" home={false}>
      <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/organizer'))} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>← Back to Dashboard</Text>
      </Pressable>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>Participant Management</Text>
        {name ? <Text style={{ color: t.textMuted, fontSize: 14 }}>{name}</Text> : null}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!players || !teams ? <Loading /> : (
        <>
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: radius['2xl'], borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }} accessibilityRole="tablist">
            {tabButton('players', `Players (${players.length})`)}
            {tabButton('owners', `Team Owners (${teams.length})`)}
          </View>

          {tab === 'players' && players.length === 0 ? <Empty text="No registrations are waiting." /> : null}
          {tab === 'players' ? players.map((r) => {
            const chosen = route[r.id];
            const needsPrice = chosen === 'MAIN_AUCTION' && categories.length > 0;
            const position = r.player_profiles?.primary_position ?? null;
            const tone = positionTone(position, t);
            const display = r.player_profiles?.display_name ?? 'Player';
            return (
              <View key={r.id} style={[portalCard(t), { gap: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ width: 52, height: 52, borderRadius: radius.xl, backgroundColor: tint(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: tone, fontSize: 18, fontWeight: '800' }}>{display.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{display}</Text>
                    {position ? <Text style={{ color: tone, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{positionLabel(position)}</Text> : null}
                    {r.player_profiles?.place ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{r.player_profiles.place}</Text> : null}
                  </View>
                  <StatusPill status={r.status} />
                </View>
                <Choice label="Allocation route" value={chosen ?? ''} options={[...ROUTES]} onChange={(v) => setRoute({ ...route, [r.id]: v })} />
                {needsPrice ? (
                  <Choice label="Price category" value={price[r.id] ?? ''} options={categories.map((c) => ({ value: c.id, label: `${c.category_code} · ₹${c.base_price.toLocaleString('en-IN')}` }))} onChange={(v) => setPrice({ ...price, [r.id]: v })} />
                ) : null}
                {decisionButtons(
                  { key: `r${r.id}`, label: `Reject ${display}`, run: () => api.rpc('reject_player_registration', { p_registration_id: r.id }) },
                  { key: `a${r.id}`, label: `Approve ${display}`, disabled: !chosen || (needsPrice && !price[r.id]), run: () => api.rpc('approve_player_registration', { p_registration_id: r.id, p_auction_category: chosen, p_auction_price_category_id: needsPrice ? price[r.id] : undefined }) },
                )}
              </View>
            );
          }) : null}

          {tab === 'owners' && teams.length === 0 ? <Empty text="No applications are waiting." /> : null}
          {tab === 'owners' ? teams.map((a) => (
            <View key={a.id} style={[portalCard(t), { gap: 12 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 52, height: 52, borderRadius: radius.xl, overflow: 'hidden', flexDirection: 'row', borderWidth: 1, borderColor: t.border }} accessibilityLabel="Team colours">
                  <View style={{ flex: 1, backgroundColor: a.primary_color ?? t.primary }} />
                  {a.secondary_color ? <View style={{ flex: 1, backgroundColor: a.secondary_color }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{a.proposed_team_name}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 13 }}>{[a.team_short_name, a.place].filter(Boolean).join(' · ')}</Text>
                </View>
                <StatusPill status={a.status} />
              </View>
              {decisionButtons(
                { key: `r${a.id}`, label: `Reject ${a.proposed_team_name}`, run: () => api.rpc('reject_team_owner_application', { p_application_id: a.id }) },
                { key: `a${a.id}`, label: `Approve ${a.proposed_team_name}`, disabled: false, run: () => api.rpc('approve_team_owner_application', { p_application_id: a.id }) },
              )}
            </View>
          )) : null}
        </>
      )}
    </PortalShell>
  );
}
