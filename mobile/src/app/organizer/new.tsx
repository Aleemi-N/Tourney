import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { portalCard, PortalShell } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { radius, useTheme } from '@/theme';

const STEPS = ['Basic Info', 'Format', 'Volleyball Rules', 'Settings', 'Review'];
const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
const finalSlug = (v: string) => slugify(v).replace(/^-|-$/g, '');

type Form = {
  id: string | null; name: string; slug: string; description: string; format: 'KNOCKOUT' | 'LEAGUE'; leagueMode: 'REGISTERED_TEAM' | 'AUCTION';
  setsToWin: '1' | '2' | '3'; winByTwo: 'yes' | 'no'; minSquad: string; maxSquad: string; ownerMode: 'OPEN' | 'INVITE_ONLY' | 'ORGANIZER_ADDED';
};
const EMPTY: Form = { id: null, name: '', slug: '', description: '', format: 'KNOCKOUT', leagueMode: 'REGISTERED_TEAM', setsToWin: '2', winByTwo: 'yes', minSquad: '6', maxSquad: '14', ownerMode: 'OPEN' };

/** Create a tournament in five steps. A draft is saved on every step, so it can be resumed from the dashboard. */
export default function NewTournament() {
  const { id: draftId } = useLocalSearchParams<{ id?: string }>();
  const { session, ready } = useAuth();
  const t = useTheme();
  const [org, setOrg] = useState<boolean | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [loadedDraft, setLoadedDraft] = useState(!draftId);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!session) return;
    api.from('organization_members').select('organization_id').eq('user_id', session.user.id).then(({ data }) => setOrg((data?.length ?? 0) > 0));
  }, [session]);

  useEffect(() => {
    if (!draftId || !session) return;
    (async () => {
      const [tn, settings, rules] = await Promise.all([
        api.from('tournaments').select('id,name,slug,description,format,league_mode').eq('id', draftId).eq('created_by', session.user.id).maybeSingle(),
        api.from('tournament_settings').select('owner_registration_mode,min_squad_size,max_squad_size').eq('tournament_id', draftId).maybeSingle(),
        api.from('volleyball_rules').select('sets_to_win,win_by_two').eq('tournament_id', draftId).is('stage_id', null).maybeSingle(),
      ]);
      if (tn.data) {
        const d = tn.data as { id: string; name: string; slug: string; description: string | null; format: Form['format']; league_mode: Form['leagueMode'] | null };
        setForm({
          id: d.id, name: d.name, slug: d.slug, description: d.description ?? '', format: d.format, leagueMode: d.league_mode ?? 'REGISTERED_TEAM',
          setsToWin: String(rules.data?.sets_to_win ?? 2) as Form['setsToWin'], winByTwo: rules.data?.win_by_two === false ? 'no' : 'yes',
          minSquad: String(settings.data?.min_squad_size ?? 6), maxSquad: String(settings.data?.max_squad_size ?? 14), ownerMode: (settings.data?.owner_registration_mode as Form['ownerMode'] | undefined) ?? 'OPEN',
        });
      }
      setLoadedDraft(true);
    })();
  }, [draftId, session]);

  async function createOrg() {
    setBusy(true); setError(null);
    const { error: e } = await api.rpc('initialize_organizer_onboarding', { p_full_name: (session?.user.user_metadata?.full_name as string | undefined) || 'Organizer', p_org_name: orgName.trim(), p_org_slug: finalSlug(orgSlug) });
    setBusy(false);
    if (e) setError(e.message); else setOrg(true);
  }

  function invalid(): string | null {
    if (!form.name.trim()) return 'Tournament name is required.';
    const slug = finalSlug(form.slug);
    if (!slug) return 'URL slug is required.';
    if (step === 4) {
      const min = Number(form.minSquad); const max = Number(form.maxSquad);
      if (!Number.isInteger(min) || min <= 0 || !Number.isInteger(max) || max < min) return 'Maximum squad size must be at least the minimum, and both must be whole numbers.';
    }
    return null;
  }

  /** Save the draft; returns its id, or null after showing the error. */
  async function save(): Promise<string | null> {
    const problem = invalid();
    if (problem) { setError(problem); return null; }
    setBusy(true); setError(null);
    const body = {
      p_name: form.name.trim(), p_slug: finalSlug(form.slug), p_description: form.description || null, p_format: form.format,
      p_league_mode: form.format === 'LEAGUE' ? form.leagueMode : null,
      p_settings: { owner_registration_mode: form.ownerMode, player_registration_enabled: true, public_live_enabled: true, min_squad_size: Number(form.minSquad), max_squad_size: Number(form.maxSquad) },
      p_vball_rules: { sets_to_win: Number(form.setsToWin), win_by_two: form.winByTwo === 'yes' },
    };
    const { data, error: e } = form.id
      ? await api.rpc('update_tournament_draft', { p_tournament_id: form.id, ...body } as never)
      : await api.rpc('create_tournament_draft', body as never);
    setBusy(false);
    if (e) { setError(e.code?.startsWith('PT') ? e.message : 'A database error occurred while saving the draft.'); return null; }
    const newId = (data as { tournament_id?: string } | null)?.tournament_id ?? form.id;
    if (newId && newId !== form.id) set({ id: newId });
    setForm((f) => ({ ...f, slug: finalSlug(f.slug) }));
    return newId ?? null;
  }

  async function next() { if (await save()) setStep((s) => Math.min(s + 1, STEPS.length)); }
  async function publish() {
    const tournamentId = await save();
    if (!tournamentId) return;
    setBusy(true);
    const { error: e } = await api.from('tournaments').update({ status: 'REGISTRATION', is_public: true }).eq('id', tournamentId);
    setBusy(false);
    if (e) return setError(e.message);
    router.replace({ pathname: '/organizer/[id]', params: { id: tournamentId } });
  }

  const back = (
    <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/organizer'))} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>← Back to Dashboard</Text>
    </Pressable>
  );
  const title = <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>{draftId ? 'Resume Tournament Setup' : 'Create New Tournament'}</Text>;

  if (!ready || (session && (org === null || !loadedDraft))) return <PortalShell role="Organizer" home={false}><Loading /></PortalShell>;
  if (!session) {
    return <PortalShell role="Organizer" home={false} signOut={false}>{back}{title}<View style={portalCard(t)}><Text style={{ color: t.textSecondary }}>Sign in to create a tournament.</Text></View><Button title="Sign In" onPress={() => router.push('/login')} /></PortalShell>;
  }
  if (!org) {
    return (
      <PortalShell role="Organizer" home={false}>
        {back}
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>Organizer Setup</Text>
        <View style={[portalCard(t), { gap: 14 }]}>
          <Text style={{ color: t.textSecondary, fontSize: 15 }}>Name your organization once; every tournament you run belongs to it.</Text>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Field label="Organization name" value={orgName} onChangeText={(v) => { setOrgName(v); setOrgSlug(finalSlug(v)); }} />
          <Field label="Organization URL slug" value={orgSlug} onChangeText={(v) => setOrgSlug(slugify(v))} autoCapitalize="none" />
          <Button title="Continue" loading={busy} disabled={!orgName.trim() || !finalSlug(orgSlug)} onPress={() => void createOrg()} />
        </View>
      </PortalShell>
    );
  }

  const tile = (label: string, value: string) => (
    <View style={{ gap: 2 }}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{value}</Text>
    </View>
  );

  return (
    <PortalShell role="Organizer" home={false}>
      {back}
      {title}
      <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step} of ${STEPS.length}: ${STEPS[step - 1]}`}>
        {STEPS.map((s, i) => <View key={s} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < step ? t.primary : t.border }} />)}
      </View>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>Step {step} of {STEPS.length}</Text>

      <View style={[portalCard(t), { gap: 14 }]}>
        <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{step === 5 ? 'Review & Publish' : STEPS[step - 1]}</Text>
        {error ? <ErrorText>{error}</ErrorText> : null}

        {step === 1 ? (
          <>
            <Field label="Tournament name" value={form.name} onChangeText={(v) => set({ name: v, slug: form.id || form.slug ? form.slug : slugify(v) })} />
            <Field label="URL slug" value={form.slug} onChangeText={(v) => set({ slug: slugify(v) })} autoCapitalize="none" placeholder="my-tournament" />
            <Field label="Description" value={form.description} onChangeText={(v) => set({ description: v })} multiline style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Choice label="Tournament structure" value={form.format} options={[{ value: 'KNOCKOUT', label: 'Knockout' }, { value: 'LEAGUE', label: 'League' }]} onChange={(v) => set({ format: v })} />
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>{form.format === 'KNOCKOUT' ? 'Single elimination: lose and you are out.' : 'Every team plays every other team, then the table decides.'}</Text>
            {form.format === 'LEAGUE' ? (
              <>
                <Choice label="League mode" value={form.leagueMode} options={[{ value: 'REGISTERED_TEAM', label: 'Registered teams' }, { value: 'AUCTION', label: 'Auction' }]} onChange={(v) => set({ leagueMode: v })} />
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>{form.leagueMode === 'AUCTION' ? 'Team owners bid for players in a live auction.' : 'Teams register themselves with their own squads.'}</Text>
              </>
            ) : null}
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Choice label="Sets required to win" value={form.setsToWin} options={[{ value: '1', label: '1 set' }, { value: '2', label: 'Best of 3' }, { value: '3', label: 'Best of 5' }]} onChange={(v) => set({ setsToWin: v })} />
            <Choice label="Win by two points" value={form.winByTwo} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={(v) => set({ winByTwo: v })} />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Field label="Minimum squad size" value={form.minSquad} onChangeText={(v) => set({ minSquad: v })} keyboardType="number-pad" />
            <Field label="Maximum squad size" value={form.maxSquad} onChangeText={(v) => set({ maxSquad: v })} keyboardType="number-pad" />
            <Choice label="Team owner registration" value={form.ownerMode} options={[{ value: 'OPEN', label: 'Open' }, { value: 'INVITE_ONLY', label: 'Invite only' }, { value: 'ORGANIZER_ADDED', label: 'Organizer added' }]} onChange={(v) => set({ ownerMode: v })} />
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>{form.ownerMode === 'OPEN' ? 'Anyone can apply.' : form.ownerMode === 'INVITE_ONLY' ? 'Owners apply with a code.' : 'No public form; you add teams yourself.'}</Text>
          </>
        ) : null}

        {step === 5 ? (
          <View style={{ gap: 14, backgroundColor: t.surfaceMuted, borderRadius: radius.xl, padding: 16 }}>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Confirm your tournament details. Registration will be enabled once published.</Text>
            {tile('Tournament', `${form.name || 'Unnamed'}  ·  /${finalSlug(form.slug) || 'no-slug'}`)}
            {tile('Format', form.format === 'LEAGUE' ? `League (${form.leagueMode === 'AUCTION' ? 'Auction' : 'Registered teams'})` : 'Knockout')}
            {tile('Scoring', `Best of ${form.setsToWin === '1' ? '1' : form.setsToWin === '2' ? '3' : '5'}${form.winByTwo === 'yes' ? ', win by two' : ''}`)}
            {tile('Squads', `${form.minSquad} to ${form.maxSquad} players`)}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        {step < STEPS.length ? <Button title="Continue" loading={busy} disabled={!form.name.trim() || !form.slug} onPress={() => void next()} /> : <Button title="Open Registration" loading={busy} onPress={() => void publish()} />}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button tone="secondary" title="Back" disabled={step === 1 || busy} onPress={() => { setError(null); setStep((s) => Math.max(s - 1, 1)); }} /></View>
          <View style={{ flex: 1 }}><Button tone="secondary" title="Save Draft" disabled={busy} onPress={() => void save()} /></View>
        </View>
      </View>
    </PortalShell>
  );
}
