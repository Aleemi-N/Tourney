import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { Text } from '@/components/text';
import { Button, ErrorText, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
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

  const input = { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text, paddingHorizontal: 14, fontSize: 16 } as const;
  return (
    <Screen>
      <Heading>Sign in to Tourny</Heading>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Text style={{ color: t.textSecondary }}>Email</Text>
      <TextInput accessibilityLabel="Email" style={input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Text style={{ color: t.textSecondary }}>Password</Text>
      <TextInput accessibilityLabel="Password" style={input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={() => void submit()} />
      <Button title="Sign in" onPress={() => void submit()} loading={busy} disabled={!email || !password} />
    </Screen>
  );
}
