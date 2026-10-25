import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Card, Heading, Loading, Screen } from '@/components/ui';
import { api, apiUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function AccountScreen() {
  const { session, ready, signOut } = useAuth();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return setName(null);
    api.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => setName((data?.full_name as string | undefined) ?? null));
  }, [session]);

  if (!ready) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Heading>Account</Heading>
      {session ? (
        <Card>
          <Body>{name ?? session.user.email}</Body>
          <Body muted>{session.user.email}</Body>
          <Button tone="secondary" title="Sign out" onPress={() => void signOut()} />
        </Card>
      ) : (
        <Card>
          <Body muted>Sign in to score matches and see your registrations.</Body>
          <Link href="/login" asChild><Button title="Sign in" onPress={() => {}} /></Link>
        </Card>
      )}
      <Body muted>Connected to {apiUrl}</Body>
    </Screen>
  );
}
