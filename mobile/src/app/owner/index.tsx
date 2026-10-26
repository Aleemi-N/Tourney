import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useOwnerTeams } from '@/components/owner';
import { PortalIntro, PortalShell, Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

type Application = { id: string; proposed_team_name: string; status: string; tournaments: { name: string } | null };
type Open = { id: string; name: string; slug: string; format: string | null; status: string };

/** The team owner dashboard: franchises, pending applications and tournaments to join. */
export default function OwnerDashboard() {
  const { session, ready } = useAuth();
  const t = useTheme();
  const { teams, error } = useOwnerTeams();
  const [applications, setApplications] = useState<Application[]>([]);
  const [open, setOpen] = useState<Open[]>([]);

  useEffect(() => {
    if (!session) return;
    api.from('team_owner_applications').select('id,proposed_team_name,status,tournaments(name)').eq('user_id', session.user.id).in('status', ['PENDING', 'CHANGES_REQUESTED', 'REJECTED']).then(({ data }) => setApplications((data as unknown as Application[]) ?? []));
    api.from('public_tournament_view').select('id,name,slug,format,status').eq('status', 'REGISTRATION').limit(6).then(({ data }) => setOpen((data as unknown as Open[]) ?? []));
  }, [session]);

  if (!ready) return <PortalShell role="Team Owner"><Loading /></PortalShell>;
  if (!session) {
    return (
      <PortalShell role="Team Owner" signOut={false}>
        <PortalIntro eyebrow="Owner portal" title="Welcome back." text="Sign in to manage your franchise, follow live auctions and track your squad." />
        <Button title="Sign In" onPress={() => router.push('/login')} />
      </PortalShell>
    );
  }

  return (
    <PortalShell role="Team Owner">
      <PortalIntro eyebrow="Owner portal" title="Welcome back." text="Manage your franchise, monitor live auctions, and track squad progress." />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Section title="Active franchises">
        {teams === null && !error ? <Loading /> : null}
        {teams?.length === 0 ? <Empty text="You do not own an approved team yet." /> : null}
        {teams?.map((team) => (
          <Pressable key={team.id} accessibilityRole="link" accessibilityLabel={`${team.name}, ${team.tournament_name}`} onPress={() => router.push({ pathname: '/owner/team/[teamId]', params: { teamId: team.id } })} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 14, borderLeftWidth: 6, borderLeftColor: team.primary_color ?? t.primary }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 19, fontWeight: '800' }}>{team.name}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>{team.tournament_name}{team.place ? ` · ${team.place}` : ''}</Text>
            </View>
            <ArrowRight size={18} color={t.primary} />
          </Pressable>
        ))}
      </Section>
      {applications.length > 0 ? (
        <Section title="Pending applications">
          {applications.map((a) => (
            <View key={a.id} style={[portalCard(t), { gap: 6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <Text style={{ flex: 1, color: t.text, fontSize: 17, fontWeight: '700' }}>{a.proposed_team_name}</Text>
                <StatusPill status={a.status} />
              </View>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>{a.tournaments?.name}</Text>
            </View>
          ))}
        </Section>
      ) : null}
      {open.length > 0 ? (
        <Section title="Tournaments open for teams">
          {open.map((tn) => (
            <Pressable key={tn.id} accessibilityRole="link" accessibilityLabel={tn.name} onPress={() => router.push({ pathname: '/register/team/[slug]', params: { slug: tn.slug } })} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{tn.name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{tn.format ? tn.format[0] + tn.format.slice(1).toLowerCase() : 'Tournament'} · apply with a team</Text>
              </View>
              <ArrowRight size={18} color={t.primary} />
            </Pressable>
          ))}
        </Section>
      ) : null}
    </PortalShell>
  );
}
