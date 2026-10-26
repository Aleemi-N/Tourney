import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/text';
import { PortalIntro, PortalShell, portalCard } from '@/components/shell';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { Empty } from '@/components/tournament';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { MatchState } from '@/lib/live';
import { useTheme } from '@/theme';

/** The scorer workspace: matches assigned to the signed-in user. */
export default function MyMatchesScreen() {
  const { session, ready } = useAuth();
  const t = useTheme();
  const [matches, setMatches] = useState<MatchState[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data: assignments, error: e } = await api.from('match_scorers').select('match_id').eq('user_id', session.user.id);
    if (e) return setError(e.message);
    const states = await Promise.all((assignments ?? []).map(async (a) => {
      const { data } = await api.rpc('get_scorer_match_state', { p_match_id: a.match_id as string });
      return data as unknown as MatchState | null;
    }));
    setMatches(states.filter((s): s is MatchState => !!s));
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  if (!ready) return <PortalShell role="Scorer"><Loading /></PortalShell>;
  if (!session) {
    return (
      <PortalShell role="Scorer" signOut={false}>
        <PortalIntro eyebrow="Scorer workspace" title="Assigned matches" text="Sign in to see the matches assigned to you." />
        <Link href="/login" asChild><Button title="Sign In" onPress={() => {}} /></Link>
      </PortalShell>
    );
  }
  return (
    <PortalShell role="Scorer">
      <PortalIntro eyebrow="Scorer workspace" title="Assigned matches" text="Only matches assigned to your account appear here. Point actions remain authorized by the scoring RPC." />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {matches === null && !error ? <Loading /> : null}
      {matches?.length === 0 ? <Empty text="No matches are assigned to you." /> : null}
      {matches?.map((m) => (
        <Link key={m.match.id} href={{ pathname: '/scorer/[id]', params: { id: m.match.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`${m.home_team.name} versus ${m.away_team.name}`} style={{ ...portalCard(t), gap: 6 }}>
            <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>Match {m.match.match_number ?? '—'}</Text>
            <Text style={{ color: t.text, fontSize: 22, lineHeight: 28, fontWeight: '800' }}>{m.home_team.name} <Text style={{ color: t.textMuted, fontWeight: '500' }}>vs</Text> {m.away_team.name}</Text>
            {m.match.venue ? <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '500' }}>{m.match.venue}{m.match.court ? ` · Court ${m.match.court}` : ''}</Text> : null}
            <View style={{ marginTop: 6 }}><StatusPill status={m.match.status} /></View>
          </Pressable>
        </Link>
      ))}
    </PortalShell>
  );
}
