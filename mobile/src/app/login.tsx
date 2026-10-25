import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { AuthField, AuthShell } from '@/components/auth-card';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { siteUrl } from '@/lib/api';
import { useTheme } from '@/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const t = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const message = await signIn(email, password);
    setBusy(false);
    if (message) setError(message); else router.back();
  }

  // Password reset links open in a browser (the link belongs to the browser that asked for it), so it starts on the website.
  const forgot = () => void Linking.openURL(`${siteUrl}/forgot-password`);

  return (
    <AuthShell title="Sign In" subtitle="Welcome back to Tourny."
      footer={<Text style={{ color: t.textSecondary, fontSize: 14 }}>New to Tourny? <Link href="/register" style={{ color: t.primary, fontWeight: '700' }}>Create Account</Link></Text>}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <AuthField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <AuthField label="Password" secure value={password} onChangeText={setPassword} autoComplete="password" textContentType="password" onSubmitEditing={() => void submit()}
        right={<Pressable accessibilityRole="link" onPress={forgot} hitSlop={8}><Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>Forgot password?</Text></Pressable>} />
      <Button title="Sign In" onPress={() => void submit()} loading={busy} disabled={!email || !password} />
    </AuthShell>
  );
}
