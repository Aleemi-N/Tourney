import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { PhotoField } from '@/components/photo-field';
import { portalCard, PortalShell } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

const POSITIONS = [
  { value: 'SETTER', label: 'Setter' }, { value: 'OUTSIDE_HITTER', label: 'Outside hitter' }, { value: 'MIDDLE_BLOCKER', label: 'Middle blocker' },
  { value: 'OPPOSITE', label: 'Opposite' }, { value: 'LIBERO', label: 'Libero' }, { value: 'UNIVERSAL', label: 'Universal' },
] as const;
type Position = (typeof POSITIONS)[number]['value'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'].map((s) => ({ value: s, label: s }));

type Profile = {
  display_name: string | null; date_of_birth: string | null; phone: string | null; place: string | null; height_cm: number | null; photo_path: string | null;
  primary_position: Position | null; secondary_position: Position | null; playing_history: string | null; jersey_name: string | null; jersey_number: string | null; jersey_size: string | null;
};

/** The player's own profile, the same fields as the website's Player Profile page. */
export default function ProfileScreen() {
  const { session, ready } = useAuth();
  const t = useTheme();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [form, setForm] = useState({ name: '', dob: '', phone: '', place: '', height: '', primary: '' as Position | '', secondary: '' as Position | '', jerseyName: '', jerseyNumber: '', jerseySize: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!session) return;
    api.from('player_profiles').select('*').eq('user_id', session.user.id).maybeSingle().then(({ data }) => {
      const p = data as unknown as Profile | null;
      setProfile(p);
      if (!p) return;
      setPhoto(p.photo_path);
      setForm({ name: p.display_name ?? '', dob: p.date_of_birth ?? '', phone: p.phone ?? '', place: p.place ?? '', height: p.height_cm?.toString() ?? '', primary: p.primary_position ?? '', secondary: p.secondary_position ?? '', jerseyName: p.jersey_name ?? '', jerseyNumber: p.jersey_number ?? '', jerseySize: p.jersey_size ?? '' });
    });
  }, [session]);

  const set = (patch: Partial<typeof form>) => { setOk(false); setForm({ ...form, ...patch }); };

  async function save() {
    setError(null); setOk(false);
    if (!photo) return setError('Profile photo is required.');
    if (form.secondary && form.secondary === form.primary) return setError('Secondary position must be different from primary position.');
    if (form.dob && !/^\d{4}-\d{2}-\d{2}$/.test(form.dob)) return setError('Use a date like 1999-05-05.');
    setBusy(true);
    const { error: e } = await api.rpc('update_player_profile', {
      p_display_name: form.name.trim(), p_primary_position: form.primary, p_photo_path: photo, p_date_of_birth: form.dob || undefined, p_phone: form.phone || undefined,
      p_place: form.place || undefined, p_height_cm: form.height ? parseFloat(form.height) : undefined, p_secondary_position: form.secondary || undefined,
      p_playing_history: profile?.playing_history || undefined, p_jersey_name: form.jerseyName || undefined, p_jersey_number: form.jerseyNumber || undefined, p_jersey_size: form.jerseySize || undefined,
    });
    setBusy(false);
    if (e) return setError(e.message);
    setOk(true);
  }

  const back = (
    <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.back() : router.replace('/account'))} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>← Back to Tourny</Text>
    </Pressable>
  );

  if (!ready || (session && profile === undefined)) return <PortalShell role="Player" home={false}><Loading /></PortalShell>;
  if (!session || !profile) {
    return (
      <PortalShell role="Player" home={false}>
        {back}
        <View style={portalCard(t)}><Text style={{ color: t.textSecondary }}>{session ? 'You have no player profile yet. Register for a tournament as a player to create one.' : 'Sign in to edit your player profile.'}</Text></View>
      </PortalShell>
    );
  }

  return (
    <PortalShell role="Player" home={false}>
      {back}
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8 }}>Player Profile</Text>
      <View style={[portalCard(t), { gap: 14 }]}>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>Profile updated successfully.</Text> : null}
        <PhotoField bucket="avatars" userId={session.user.id} label="Profile photo *" path={photo} onChange={(p) => { setOk(false); setPhoto(p); }} />
        <Field label="Full name *" value={form.name} onChangeText={(v) => set({ name: v })} autoComplete="name" />
        <Field label="Date of birth (YYYY-MM-DD)" value={form.dob} onChangeText={(v) => set({ dob: v })} placeholder="1999-05-05" keyboardType="numbers-and-punctuation" />
        <Field label="Phone" value={form.phone} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" autoComplete="tel" />
        <Field label="Club / location" value={form.place} onChangeText={(v) => set({ place: v })} />
        <Field label="Height (cm)" value={form.height} onChangeText={(v) => set({ height: v })} keyboardType="decimal-pad" />
        <Choice label="Primary position *" value={form.primary} options={[...POSITIONS]} onChange={(v) => set({ primary: v, secondary: form.secondary === v ? '' : form.secondary })} />
        <Choice label="Secondary position (optional)" value={form.secondary} options={POSITIONS.filter((p) => p.value !== form.primary)} onChange={(v) => set({ secondary: form.secondary === v ? '' : v })} />
        <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>Jersey & Kit Preferences</Text>
          <Field label="Jersey name (back print)" value={form.jerseyName} onChangeText={(v) => set({ jerseyName: v.toUpperCase() })} maxLength={20} placeholder="e.g. ALEX" autoCapitalize="characters" />
          <Field label="Jersey number" value={form.jerseyNumber} onChangeText={(v) => set({ jerseyNumber: v })} maxLength={4} placeholder="e.g. 10" />
          <Choice label="Jersey size" value={form.jerseySize} options={SIZES} onChange={(v) => set({ jerseySize: v })} />
        </View>
        <Button title="Save Profile" loading={busy} disabled={!form.name.trim() || !form.primary} onPress={() => void save()} />
      </View>
    </PortalShell>
  );
}
