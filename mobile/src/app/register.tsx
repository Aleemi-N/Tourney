import { Link, router } from 'expo-router';
import { useState } from 'react';
import { AuthField, AuthShell } from '@/components/auth-card';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** Create an account (the same fields as the website). */
export default function RegisterScreen() {
  const t = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error: e } = await api.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
    setBusy(false);
    if (e) setError(e.message); else router.dismissAll();
  }

  return (
    <AuthShell title="Create Account" subtitle="Set up your Tourny profile."
      footer={<Text style={{ color: t.textSecondary, fontSize: 14 }}>Already have an account? <Link href="/login" style={{ color: t.primary, fontWeight: '700' }}>Sign In</Link></Text>}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <AuthField label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
      <AuthField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <AuthField label="Password" secure value={password} onChangeText={setPassword} autoComplete="new-password" textContentType="newPassword" onSubmitEditing={() => void submit()} />
      <Button title="Create Account" onPress={() => void submit()} loading={busy} disabled={!name.trim() || !email || password.length < 6} />
    </AuthShell>
  );
}
