import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api, apiUrl } from '@/lib/api';
import { useTheme } from '@/theme';

/** Download my data, and delete my account (both are required by the app stores). */
export function AccountData() {
  const t = useTheme();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [confirm, setConfirm] = useState('');

  async function download() {
    setBusy('export'); setError(null); setOk(null);
    const { data, error: e } = await api.rpc('export_my_data');
    setBusy(null);
    if (e) return setError(e.message);
    const text = JSON.stringify(data, null, 2);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'tourny-my-data.json';
      a.click();
      return setOk('Your data was downloaded.');
    }
    try { await Share.share({ title: 'My Tourny data', message: text }); } catch { setError('Could not open the share sheet.'); }
  }

  async function remove() {
    setBusy('delete'); setError(null);
    try {
      const { data } = await api.auth.getSession();
      const response = await fetch(`${apiUrl}/account/delete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? `Could not delete the account (${response.status}).`);
      await api.auth.signOut();
      router.replace('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the account.'); }
    setBusy(null);
  }

  return (
    <View style={[portalCard(t), { gap: 10 }]}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Your data</Text>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>Download everything Tourny holds about you, or delete your account.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{ok}</Text> : null}
      <Button tone="secondary" title="Download my data" loading={busy === 'export'} disabled={busy !== null} onPress={() => void download()} />
      {!asking ? <Button tone="danger-outline" title="Delete my account" onPress={() => setAsking(true)} /> : (
        <View style={{ gap: 8 }}>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>This removes your name, phone, email, photo and sign-in, and cannot be undone. Registrations still waiting are withdrawn. Results you appear in stay as "Former player". If you are the only organizer of a running tournament, finish or hand it over first.</Text>
          <Field label="Type DELETE to confirm" value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => { setAsking(false); setConfirm(''); }} /></View>
            <View style={{ flex: 1 }}><Button tone="danger" title="Delete for good" loading={busy === 'delete'} disabled={busy !== null || confirm !== 'DELETE'} onPress={() => void remove()} /></View>
          </View>
        </View>
      )}
    </View>
  );
}
