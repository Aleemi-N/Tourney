import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { TabFrame } from '@/components/tab-frame';
import { Empty } from '@/components/tournament';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type OwnerTeam = { id: string; name: string; short_name: string | null; logo_path: string | null; place: string | null; primary_color: string | null; secondary_color: string | null; tournament_id: string; tournament_name: string };

const TABS = [
  { key: 'index', label: 'Overview', path: '/owner/team/[teamId]' },
  { key: 'players', label: 'Player pool', path: '/owner/team/[teamId]/players' },
  { key: 'squad', label: 'My squad', path: '/owner/team/[teamId]/squad' },
  { key: 'auction', label: 'Live auction', path: '/owner/team/[teamId]/auction' },
  { key: 'fixtures', label: 'Fixtures', path: '/owner/team/[teamId]/fixtures' },
  { key: 'results', label: 'Results', path: '/owner/team/[teamId]/results' },
] as const;

export type OwnerTab = (typeof TABS)[number]['key'];

/** The teams the signed-in user owns (the same rule as the web getOwnerTeams). */
export function useOwnerTeams() {
  const { session } = useAuth();
  const [teams, setTeams] = useState<OwnerTeam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return setTeams(null);
    api.from('team_owners').select('team_id,teams!inner(id,name,short_name,logo_path,place,primary_color,secondary_color,tournament_id,tournaments(name))').eq('user_id', session.user.id).eq('status', 'ACTIVE').then(({ data, error: e }) => {
      if (e) return setError(e.message);
      type Row = { teams: (Omit<OwnerTeam, 'tournament_name'> & { tournaments: { name: string } | { name: string }[] | null }) | null };
      setTeams(((data ?? []) as unknown as Row[]).flatMap((row) => {
        const team = row.teams;
        if (!team) return [];
        const tn = Array.isArray(team.tournaments) ? team.tournaments[0] : team.tournaments;
        return [{ ...team, tournament_name: tn?.name ?? 'Tournament' }];
      }));
    });
  }, [session]);
  return { teams, error };
}

/** One owned team, or null when the user does not own it. */
export function useOwnerTeam(teamId: string) {
  const { teams, error } = useOwnerTeams();
  return { team: teams?.find((t) => t.id === teamId) ?? null, loading: teams === null && !error, error };
}

export function OwnerFrame({ teamId, current, title, subtitle, children }: { teamId: string; current: OwnerTab; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <TabFrame role="Team Owner" backLabel="Back to Dashboard" backHref="/owner" title={title} subtitle={subtitle} current={current}
      tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: { pathname: tab.path, params: { teamId } } }))}>
      {children}
    </TabFrame>
  );
}

/** A page of one owned team: loads the team, shows a not-found state, and renders the page with the team. */
export function OwnerPage({ tab, title, children }: { tab: OwnerTab; title: string; children: (team: OwnerTeam) => ReactNode }) {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { team, loading } = useOwnerTeam(teamId);
  return (
    <OwnerFrame teamId={teamId} current={tab} title={title} subtitle={team ? `${team.name} · ${team.tournament_name}` : undefined}>
      {loading ? <Loading /> : !team ? <Empty text="This team was not found, or you do not own it." /> : children(team)}
    </OwnerFrame>
  );
}
