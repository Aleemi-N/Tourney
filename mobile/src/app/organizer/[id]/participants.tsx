import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice } from '@/components/form';
import { PaymentLine } from '@/components/payment-settings';
import type { RegistrationPayment } from '@/lib/payments';
import { OrganizerFrame } from '@/components/organizer';
import { portalCard } from '@/components/shell';
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
  const [fees, setFees] = useState<{ player: number; team: number }>({ player: 0, team: 0 });
  const [payments, setPayments] = useState<RegistrationPayment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, tm, c, info, feeRes, payRes] = await Promise.all([
      api.from('player_tournament_registrations').select('id,status,player_profiles(display_name,primary_position,place)').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('team_owner_applications').select('id,proposed_team_name,team_short_name,place,primary_color,secondary_color,status').eq('tournament_id', id).in('status', ['PENDING', 'CHANGES_REQUESTED']).order('created_at'),
      api.from('tournament_auction_categories').select('id,category_code,display_name,base_price').eq('tournament_id', id).order('display_order'),
      api.from('tournaments').select('name').eq('id', id).maybeSingle(),
      api.rpc('get_registration_fees', { p_tournament_id: id }),
      api.rpc('list_registration_payments', { p_tournament_id: id }),
    ]);
    const f = feeRes.data as { player_fee: number; team_fee: number } | null;
    setFees({ player: Number(f?.player_fee ?? 0), team: Number(f?.team_fee ?? 0) });
    setPayments(((payRes.data ?? []) as unknown as RegistrationPayment[]).map((x) => ({ ...x, amount: Number(x.amount), refunded_amount: Number(x.refunded_amount) })));
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

  const paymentOf = (kind: 'PLAYER' | 'TEAM', registrationId: string) => payments.find((x) => x.kind === kind && x.registration_id === registrationId);
  const unpaid = (kind: 'PLAYER' | 'TEAM', registrationId: string) => {
    const fee = kind === 'PLAYER' ? fees.player : fees.team;
    return fee > 0 && !['PAID', 'WAIVED', 'PARTIALLY_REFUNDED'].includes(paymentOf(kind, registrationId)?.status ?? 'DUE');
  };

  const decisionButtons = (reject: { key: string; label: string; run: () => PromiseLike<{ error: { message: string } | null }> }, approve: { key: string; label: string; disabled: boolean; run: () => PromiseLike<{ error: { message: string } | null }> }) => (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Button tone="danger-outline" title="Reject" accessibilityLabel={reject.label} loading={busy === reject.key} disabled={busy !== null} onPress={() => void decide(reject.key, reject.run)} /></View>
      <View style={{ flex: 1 }}><Button title="Approve" accessibilityLabel={approve.label} loading={busy === approve.key} disabled={busy !== null || approve.disabled} onPress={() => void decide(approve.key, approve.run)} /></View>
    </View>
  );

  return (
    <OrganizerFrame id={id} current="participants" title="Participant Management" subtitle={name}>
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
                <PaymentLine kind="PLAYER" registrationId={r.id} fee={fees.player} payment={paymentOf('PLAYER', r.id)} onChanged={load} />
                <Choice label="Allocation route" value={chosen ?? ''} options={[...ROUTES]} onChange={(v) => setRoute({ ...route, [r.id]: v })} />
                {needsPrice ? (
                  <Choice label="Price category" value={price[r.id] ?? ''} options={categories.map((c) => ({ value: c.id, label: `${c.category_code} · ₹${c.base_price.toLocaleString('en-IN')}` }))} onChange={(v) => setPrice({ ...price, [r.id]: v })} />
                ) : null}
                {decisionButtons(
                  { key: `r${r.id}`, label: `Reject ${display}`, run: () => api.rpc('reject_player_registration', { p_registration_id: r.id }) },
                  { key: `a${r.id}`, label: `Approve ${display}`, disabled: !chosen || (needsPrice && !price[r.id]) || unpaid('PLAYER', r.id), run: () => api.rpc('approve_player_registration', { p_registration_id: r.id, p_auction_category: chosen, p_auction_price_category_id: needsPrice ? price[r.id] : undefined }) },
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
              <PaymentLine kind="TEAM" registrationId={a.id} fee={fees.team} payment={paymentOf('TEAM', a.id)} onChanged={load} />
              {decisionButtons(
                { key: `r${a.id}`, label: `Reject ${a.proposed_team_name}`, run: () => api.rpc('reject_team_owner_application', { p_application_id: a.id }) },
                { key: `a${a.id}`, label: `Approve ${a.proposed_team_name}`, disabled: unpaid('TEAM', a.id), run: () => api.rpc('approve_team_owner_application', { p_application_id: a.id }) },
              )}
            </View>
          )) : null}
        </>
      )}
    </OrganizerFrame>
  );
}
