import { Link } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, Heading, Loading, Screen, StatusPill } from '@/components/ui';
import { api, apiUrl } from '@/lib/api';
import { Choice } from '@/components/form';
import { useAuth } from '@/lib/auth';
import { useSetThemeChoice } from '@/lib/theme-choice';
import { ThemeChoiceContext } from '@/theme';
import { useOrganizerTournaments } from '@/lib/organizer';

export default function AccountScreen() {
  const { session, ready, signOut } = useAuth();
  const themeChoice = useContext(ThemeChoiceContext);
  const setThemeChoice = useSetThemeChoice();
  const [name, setName] = useState<string | null>(null);
  const { tournaments: organized } = useOrganizerTournaments(session?.user.id);
  const [applications, setApplications] = useState<{ key: string; title: string; status: string }[]>([]);

  useEffect(() => {
    if (!session) return setName(null);
    api.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle().then(({ data }) => setName((data?.full_name as string | undefined) ?? null));
  }, [session]);

  // Registrations and team applications the user has submitted, with their review status.
  useEffect(() => {
    if (!session) return setApplications([]);
    (async () => {
      const [players, teams] = await Promise.all([
        api.from('player_tournament_registrations').select('id,status,tournaments(name)').eq('player_id', session.user.id),
        api.from('team_owner_applications').select('id,status,proposed_team_name,tournaments(name)').eq('user_id', session.user.id),
      ]);
      const label = (t: unknown) => (t as { name?: string } | null)?.name ?? 'Tournament';
      setApplications([
        ...((players.data ?? []) as { id: string; status: string; tournaments: unknown }[]).map((r) => ({ key: r.id, title: `Player · ${label(r.tournaments)}`, status: r.status })),
        ...((teams.data ?? []) as { id: string; status: string; proposed_team_name: string; tournaments: unknown }[]).map((r) => ({ key: r.id, title: `${r.proposed_team_name} · ${label(r.tournaments)}`, status: r.status })),
      ]);
    })();
  }, [session]);

  if (!ready) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Heading eyebrow="You">Account</Heading>
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
      {organized && organized.length > 0 ? (
        <Card>
          <Heading>Organizer</Heading>
          <Link href="/organizer" asChild><Button title="Review registrations" onPress={() => {}} /></Link>
        </Card>
      ) : null}
      {applications.length > 0 ? (
        <Card>
          <Heading>My registrations</Heading>
          {applications.map((a) => (
            <View key={a.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Body>{a.title}</Body>
              <StatusPill status={a.status} />
            </View>
          ))}
        </Card>
      ) : null}
      <Card>
        <Choice label="Appearance" value={themeChoice} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={setThemeChoice} />
      </Card>
      <Body muted>Connected to {apiUrl}</Body>
    </Screen>
  );
}
