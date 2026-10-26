import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard, Section } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { detectPreset, PRESET_OPTIONS, PRESETS, presetRuleArgs, type PresetKey } from '@/lib/rules';
import { radius, useTheme } from '@/theme';

type Method = 'LOT_DRAW' | 'AUCTION';
type PriceRule = 'SAME_BASE_PRICE' | 'ORGANIZER_SETS_PRICE';
type Lock = { locked: boolean; reason: string | null };
type Settings = {
  player_registration_enabled: boolean; team_registration_enabled: boolean; max_teams: number | null; min_squad_size: number; max_squad_size: number | null;
  auction_starting_purse: number | null; auction_base_price: number | null; auction_bid_increment: number | null;
  icon_selection_method: Method; setter_selection_method: Method; reauction_price_rule: PriceRule;
};
type Stage = { id: string; name: string; stage_type: string; sequence: number };
type Rule = { id: string; stage_id: string | null; sets_to_win: number };
type Configuration = { settings: Settings; icon_lock: Lock; setter_lock: Lock; stages: Stage[]; rules: Rule[] };
type Details = { name: string; venue: string | null; start_date: string | null; end_date: string | null; description: string | null; format: string | null; league_mode: string | null };
type Removal = { stage_id: string; stage_name: string; allowed: boolean; requires_strong_confirmation: boolean; confirmation_phrase: string; snapshot: string; blockers: { code: string; message: string }[]; remove: Record<string, number>; preserve: string[] };

const YES_NO = [{ value: 'yes', label: 'Open' }, { value: 'no', label: 'Closed' }];
const METHODS = [{ value: 'LOT_DRAW', label: 'Lot draw' }, { value: 'AUCTION', label: 'Auction' }] as { value: Method; label: string }[];
const REAUCTION = [{ value: 'SAME_BASE_PRICE', label: 'Same base price' }, { value: 'ORGANIZER_SETS_PRICE', label: 'Organizer sets price' }] as { value: PriceRule; label: string }[];

function Panel({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[portalCard(t), { gap: 14 }]}>
      <View style={{ gap: 2 }}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        {text ? <Text style={{ color: t.textSecondary, fontSize: 14 }}>{text}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Message({ error, ok }: { error: string | null; ok: string | null }) {
  const t = useTheme();
  if (error) return <ErrorText>{error}</ErrorText>;
  return ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{ok}</Text> : null;
}

/** Tournament settings: details, registration and squads, auction options, match format and stages. */
export default function OrganizerSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const name = useTournamentName(id);
  const [details, setDetails] = useState<Details | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, c] = await Promise.all([
      api.from('tournaments').select('name,venue,start_date,end_date,description,format,league_mode').eq('id', id).maybeSingle(),
      api.rpc('get_tournament_phase5a_configuration', { p_tournament_id: id }),
    ]);
    if (d.error || c.error) return setError((d.error ?? c.error)!.message);
    setDetails(d.data as Details | null);
    setConfig(c.data as unknown as Configuration);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <OrganizerFrame id={id} current="settings" title="Settings" subtitle={name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!details || !config ? (error ? null : <Loading />) : (
        <>
          <DetailsForm id={id} initial={details} onSaved={load} />
          <RegistrationForm id={id} config={config} auction={details.format === 'LEAGUE' && details.league_mode === 'AUCTION'} onSaved={load} />
          {details.format === 'LEAGUE' && details.league_mode === 'AUCTION' ? <PriceCategories id={id} /> : null}
          <Section title="Match Format">
            <FormatForm id={id} config={config} onSaved={load} />
          </Section>
          <StageRemoval stages={config.stages} onRemoved={load} />
        </>
      )}
    </OrganizerFrame>
  );
}

function DetailsForm({ id, initial, onSaved }: { id: string; initial: Details; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: initial.name, venue: initial.venue ?? '', start: initial.start_date ?? '', end: initial.end_date ?? '', description: initial.description ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (v: string) => setForm({ ...form, [key]: v });

  async function save() {
    setError(null); setOk(null);
    const date = /^\d{4}-\d{2}-\d{2}$/;
    if (form.name.trim() === '') return setError('Enter a tournament name.');
    if ((form.start && !date.test(form.start)) || (form.end && !date.test(form.end))) return setError('Use dates like 2026-11-01.');
    if (form.start && form.end && form.end < form.start) return setError('The end date cannot be before the start date.');
    setBusy(true);
    const { data, error: e } = await api.rpc('update_tournament_details', {
      p_tournament_id: id, p_name: form.name.trim(), p_venue: form.venue || undefined, p_start_date: form.start || undefined, p_end_date: form.end || undefined, p_description: form.description || undefined,
    });
    setBusy(false);
    const result = data as { ok?: boolean } | null;
    if (e || !result?.ok) return setError('Unable to save tournament details.');
    setOk('Tournament details saved.');
    await onSaved();
  }

  return (
    <Panel title="Tournament Details" text="The name, venue and dates shown on the public pages.">
      <Field label="Tournament name" value={form.name} onChangeText={set('name')} />
      <Field label="Venue" value={form.venue} onChangeText={set('venue')} />
      <Field label="Start date (YYYY-MM-DD)" value={form.start} onChangeText={set('start')} autoCapitalize="none" placeholder="2026-11-01" />
      <Field label="End date (YYYY-MM-DD)" value={form.end} onChangeText={set('end')} autoCapitalize="none" placeholder="2026-11-03" />
      <Field label="Description" value={form.description} onChangeText={set('description')} multiline style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} />
      <Message error={error} ok={ok} />
      <Button title="Save Details" loading={busy} onPress={() => void save()} />
    </Panel>
  );
}

function RegistrationForm({ id, config, auction, onSaved }: { id: string; config: Configuration; auction: boolean; onSaved: () => Promise<void> }) {
  const s = config.settings;
  const [form, setForm] = useState({
    player: s.player_registration_enabled ? 'yes' : 'no', team: s.team_registration_enabled ? 'yes' : 'no', maxTeams: s.max_teams?.toString() ?? '', minSquad: String(s.min_squad_size), maxSquad: s.max_squad_size?.toString() ?? '',
    purse: s.auction_starting_purse?.toString() ?? '', base: s.auction_base_price?.toString() ?? '', step: s.auction_bid_increment?.toString() ?? '',
    icon: s.icon_selection_method, setter: s.setter_selection_method, reauction: s.reauction_price_rule,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const t = useTheme();
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  async function save() {
    setError(null); setOk(null);
    const min = Number(form.minSquad);
    const max = form.maxSquad ? Number(form.maxSquad) : undefined;
    if (!Number.isInteger(min) || min <= 0 || (max !== undefined && max < min)) return setError('Maximum squad size must be at least the positive minimum squad size.');
    setBusy(true);
    const num = (v: string) => (v ? Number(v) : undefined);
    const { error: e } = await api.rpc('update_tournament_settings', {
      p_tournament_id: id, p_player_registration_enabled: form.player === 'yes', p_team_registration_enabled: form.team === 'yes', p_max_teams: num(form.maxTeams),
      p_min_squad_size: min, p_max_squad_size: max, p_auction_starting_purse: num(form.purse), p_auction_base_price: num(form.base), p_auction_bid_increment: num(form.step),
      p_icon_selection_method: form.icon, p_setter_selection_method: form.setter, p_reauction_price_rule: form.reauction,
    });
    setBusy(false);
    if (e) return setError(e.message.includes('locked:') ? e.message.split('locked:').pop()?.trim() || 'This setting is locked.' : 'Unable to update tournament settings.');
    setOk('Settings updated successfully.');
    await onSaved();
  }

  return (
    <Panel title="Registration & Squads" text="Who can register, how many teams play, and how big a squad is.">
      <Choice label="Player registration" value={form.player} options={YES_NO} onChange={(v) => set({ player: v })} />
      <Choice label="Team registration" value={form.team} options={YES_NO} onChange={(v) => set({ team: v })} />
      <Field label="Maximum teams" value={form.maxTeams} onChangeText={(v) => set({ maxTeams: v })} keyboardType="number-pad" placeholder="No limit" />
      <Field label="Minimum squad size" value={form.minSquad} onChangeText={(v) => set({ minSquad: v })} keyboardType="number-pad" />
      <Field label="Maximum squad size" value={form.maxSquad} onChangeText={(v) => set({ maxSquad: v })} keyboardType="number-pad" placeholder="No limit" />
      {auction ? (
        <>
          <Field label="Starting purse (₹)" value={form.purse} onChangeText={(v) => set({ purse: v })} keyboardType="decimal-pad" />
          <Field label="Base price (₹)" value={form.base} onChangeText={(v) => set({ base: v })} keyboardType="decimal-pad" />
          <Field label="Bid increment (₹)" value={form.step} onChangeText={(v) => set({ step: v })} keyboardType="decimal-pad" />
          <Choice label="Icon players" value={form.icon} options={METHODS} onChange={(v) => !config.icon_lock.locked && set({ icon: v })} />
          {config.icon_lock.locked ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{config.icon_lock.reason ?? 'Locked.'}</Text> : null}
          <Choice label="Setter players" value={form.setter} options={METHODS} onChange={(v) => !config.setter_lock.locked && set({ setter: v })} />
          {config.setter_lock.locked ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{config.setter_lock.reason ?? 'Locked.'}</Text> : null}
          <Choice label="Re-auction price" value={form.reauction} options={REAUCTION} onChange={(v) => set({ reauction: v })} />
        </>
      ) : null}
      <Message error={error} ok={ok} />
      <Button title="Save Settings" loading={busy} onPress={() => void save()} />
    </Panel>
  );
}

function FormatRow({ id, stage, rule, onSaved }: { id: string; stage: Stage | null; rule?: Rule; onSaved: () => Promise<void> }) {
  const t = useTheme();
  const [selected, setSelected] = useState<PresetKey | ''>(rule ? detectPreset(rule.sets_to_win) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function save(key: PresetKey) {
    setSelected(key); setBusy(true); setError(null); setOk(null);
    const { error: e } = await api.rpc('save_volleyball_rule', presetRuleArgs(id, stage?.id ?? null, key));
    setBusy(false);
    if (e) return setError(e.message);
    setOk(`${PRESETS[key].label} saved.`);
    await onSaved();
  }

  return (
    <View style={[portalCard(t), { gap: 10 }]}>
      <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{stage ? stage.name : 'Default format'}</Text>
      <Text style={{ color: t.textSecondary, fontSize: 13 }}>{stage ? 'Applies to every match in this stage unless a match has its own format.' : 'Used when a stage has no format of its own.'}</Text>
      <Choice label="Sets per match" value={selected} options={PRESET_OPTIONS} onChange={(v) => !busy && void save(v)} />
      <Message error={error} ok={ok} />
    </View>
  );
}

function FormatForm({ id, config, onSaved }: { id: string; config: Configuration; onSaved: () => Promise<void> }) {
  const ordered = [...config.stages].sort((a, b) => a.sequence - b.sequence);
  return (
    <>
      {ordered.length === 0 ? <FormatRow id={id} stage={null} rule={config.rules.find((r) => r.stage_id === null)} onSaved={onSaved} /> : null}
      {ordered.map((stage) => <FormatRow key={stage.id} id={id} stage={stage} rule={config.rules.find((r) => r.stage_id === stage.id)} onSaved={onSaved} />)}
    </>
  );
}

function StageRemoval({ stages, onRemoved }: { stages: Stage[]; onRemoved: () => Promise<void> }) {
  const t = useTheme();
  const [plan, setPlan] = useState<Removal | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function preview(stageId: string) {
    setError(null); setOk(null); setBusy(stageId);
    const { data, error: e } = await api.rpc('preview_tournament_stage_removal', { p_stage_id: stageId });
    setBusy(null);
    if (e) return setError(e.message);
    setTyped('');
    setPlan(data as unknown as Removal);
  }

  async function remove() {
    if (!plan) return;
    setBusy('remove');
    const { error: e } = await api.rpc('remove_tournament_stage', { p_stage_id: plan.stage_id, p_expected_snapshot: plan.snapshot, p_confirmation: typed });
    setBusy(null);
    const removed = plan.stage_name;
    setPlan(null);
    if (e) return setError(e.message);
    setOk(`${removed} removed. Fixtures and standings are up to date.`);
    await onRemoved();
  }

  const label = (key: string) => key.replace(/_/g, ' ');
  return (
    <Panel title="Stages" text="Create stages and set their rules on the Fixtures page. Removing a stage also removes its fixtures and standings.">
      {stages.length === 0 ? <Text style={{ color: t.textSecondary, fontSize: 14, textAlign: 'center', padding: 12 }}>No stages yet.</Text> : null}
      {[...stages].sort((a, b) => a.sequence - b.sequence).map((stage) => (
        <View key={stage.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{stage.name}</Text>
            <Text style={{ color: t.textMuted, fontSize: 13 }}>Stage {stage.sequence} · {stage.stage_type}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${stage.name}`} disabled={busy !== null} onPress={() => void preview(stage.id)}
            style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: radius.xl, borderWidth: 1, borderColor: t.danger }}>
            <Text style={{ color: t.danger, fontSize: 14, fontWeight: '600' }}>{busy === stage.id ? 'Checking…' : 'Remove'}</Text>
          </Pressable>
        </View>
      ))}
      <Message error={error} ok={ok} />
      {plan ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
          <Text accessibilityRole="header" style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Remove {plan.stage_name}?</Text>
          {plan.blockers.map((b) => <ErrorText key={b.code}>{b.message}</ErrorText>)}
          {Object.entries(plan.remove).filter(([, n]) => n > 0).map(([k, n]) => <Text key={k} style={{ color: t.textSecondary, fontSize: 14 }}>Removes {n} {label(k)}</Text>)}
          {plan.preserve.map((p) => <Text key={p} style={{ color: t.textMuted, fontSize: 13 }}>Keeps {p}</Text>)}
          {plan.allowed ? (
            <>
              <Field label={`Type “${plan.confirmation_phrase}” to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setPlan(null)} /></View>
                <View style={{ flex: 1 }}><Button tone="danger-outline" title="Remove stage" disabled={typed !== plan.confirmation_phrase} loading={busy === 'remove'} onPress={() => void remove()} /></View>
              </View>
            </>
          ) : <Button tone="secondary" title="Close" onPress={() => setPlan(null)} />}
        </View>
      ) : null}
    </Panel>
  );
}

type Category = { category_code: string; display_name: string; base_price: number };

/** The A, B and C price categories of an auction league. They are locked once the auction is prepared. */
function PriceCategories({ id }: { id: string }) {
  const t = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [form, setForm] = useState<Record<string, { name: string; price: string }>>({ A: { name: '', price: '' }, B: { name: '', price: '' }, C: { name: '', price: '' } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [cats, auction] = await Promise.all([
        api.from('tournament_auction_categories').select('category_code,display_name,base_price').eq('tournament_id', id).order('display_order'),
        api.from('auctions').select('prepared_at').eq('tournament_id', id).maybeSingle(),
      ]);
      const next = { A: { name: '', price: '' }, B: { name: '', price: '' }, C: { name: '', price: '' } } as Record<string, { name: string; price: string }>;
      for (const c of (cats.data ?? []) as Category[]) next[c.category_code] = { name: c.display_name, price: String(c.base_price) };
      setForm(next);
      setLocked(auction.data?.prepared_at != null);
      setLoaded(true);
    })();
  }, [id]);

  async function save() {
    setError(null); setOk(null);
    const a = Number(form.A.price); const b = Number(form.B.price); const c = Number(form.C.price);
    if (![a, b, c].every((n) => Number.isFinite(n) && n > 0)) return setError('All prices are required.');
    if (a < b || b < c) return setError('Category prices must satisfy A ≥ B ≥ C > 0.');
    if (!form.A.name.trim() || !form.B.name.trim() || !form.C.name.trim()) return setError('Category display names are required (max 80 characters each).');
    setBusy(true);
    const { error: e } = await api.rpc('update_auction_price_categories', { p_tournament_id: id, p_a_name: form.A.name.trim(), p_a_price: a, p_b_name: form.B.name.trim(), p_b_price: b, p_c_name: form.C.name.trim(), p_c_price: c });
    setBusy(false);
    if (e) return setError(e.message.toLowerCase().includes('locked after preparation') ? 'Auction category configuration is locked after preparation.' : 'Unable to update auction price categories. Please try again.');
    setOk('Price categories saved.');
  }

  if (!loaded) return null;
  return (
    <Panel title="Auction Price Categories" text={locked ? 'Locked: the auction has been prepared.' : 'Players are grouped into A, B and C with a base price each (A ≥ B ≥ C).'}>
      {['A', 'B', 'C'].map((code) => locked ? (
        <View key={code} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ width: 28, color: t.primary, fontSize: 16, fontWeight: '800' }}>{code}</Text>
          <Text style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '600' }}>{form[code].name || `Category ${code}`}</Text>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>₹{Number(form[code].price).toLocaleString('en-IN')}</Text>
        </View>
      ) : (
        <View key={code} style={{ gap: 10, borderTopWidth: code === 'A' ? 0 : 1, borderTopColor: t.border, paddingTop: code === 'A' ? 0 : 12 }}>
          <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>CATEGORY {code}</Text>
          <Field label="Display name" value={form[code].name} onChangeText={(v) => setForm({ ...form, [code]: { ...form[code], name: v } })} maxLength={80} />
          <Field label="Base price (₹)" value={form[code].price} onChangeText={(v) => setForm({ ...form, [code]: { ...form[code], price: v.replace(/[^0-9.]/g, '') } })} keyboardType="decimal-pad" />
        </View>
      ))}
      <Message error={error} ok={ok} />
      {!locked ? <Button title="Save Price Categories" loading={busy} onPress={() => void save()} /> : null}
    </Panel>
  );
}
