import { router, useLocalSearchParams } from 'expo-router';
import { Calendar, ClipboardList, Gavel, Settings, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { OrganizerFrame } from '@/components/organizer';
import { portalCard, Section } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Info = { name: string; slug: string; status: string; format: string | null; league_mode: string | null; description: string | null; approval_status: string | null; approval_submitted_at: string | null; approval_rejection_reason: string | null };

/** Overview of one tournament: status, numbers, registration control and the way to the other organizer pages. */
export default function OrganizerOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const [info, setInfo] = useState<Info | null>(null);
  const [counts, setCounts] = useState<{ players: number; pending: number; teams: number; fixtures: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const count = (table: string, status?: string[]) => {
      let q = api.from(table).select('id', { count: 'exact', head: true }).eq('tournament_id', id);
      if (status) q = q.in('status', status);
      return q;
    };
    const [i, players, pending, teams, fixtures] = await Promise.all([
      api.from('tournaments').select('name,slug,status,format,league_mode,description,approval_status,approval_submitted_at,approval_rejection_reason').eq('id', id).maybeSingle(),
      count('player_tournament_registrations'), count('player_tournament_registrations', ['PENDING', 'CHANGES_REQUESTED']),
      count('teams'), count('matches'),
    ]);
    if (i.error) return setError(i.error.message);
    setInfo(i.data as Info | null);
    setCounts({ players: players.count ?? 0, pending: pending.count ?? 0, teams: teams.count ?? 0, fixtures: fixtures.count ?? 0 });
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function setRegistration(open: boolean) {
    setBusy(true);
    setError(null);
    const { error: e } = await api.from('tournaments').update({ status: open ? 'REGISTRATION' : 'PREPARATION' }).eq('id', id).in('status', open ? ['PREPARATION', 'LIVE'] : ['REGISTRATION']);
    setBusy(false);
    setConfirming(false);
    if (e) setError(e.message); else await load();
  }

  async function submitApproval() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await api.rpc('submit_tournament_for_approval', { p_tournament_id: id });
    setBusy(false);
    const ok = (typeof data === 'string' ? JSON.parse(data) : data) as { ok?: boolean } | null;
    if (e || ok?.ok !== true) return setError(e?.message ?? 'Failed to submit for approval.');
    await load();
  }

  const tile = (label: string, value: number | string) => (
    <View key={label} style={[portalCard(t), { flex: 1, minWidth: 140, padding: 16, gap: 2 }]}>
      <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{value}</Text>
    </View>
  );

  const nav = (label: string, text: string, Icon: typeof Users, path: '/organizer/[id]/participants' | '/organizer/[id]/fixtures' | '/organizer/[id]/settings' | '/organizer/[id]/lot' | '/organizer/[id]/auction') => (
    <Pressable key={label} accessibilityRole="link" accessibilityLabel={label} onPress={() => router.push({ pathname: path, params: { id } })} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <Icon size={22} color={t.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{label}</Text>
        <Text style={{ color: t.textSecondary, fontSize: 13 }}>{text}</Text>
      </View>
    </Pressable>
  );

  const open = info?.status === 'REGISTRATION';
  const canReopen = info?.status === 'PREPARATION' || info?.status === 'LIVE';

  return (
    <OrganizerFrame id={id} current="index" title={info?.name ?? 'Tournament'} subtitle={info ? `/${info.slug}` : undefined}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!info || !counts ? <Loading /> : (
        <>
          <View style={[portalCard(t), { gap: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <StatusPill status={info.status} />
              {info.approval_status && info.approval_status !== 'APPROVED' ? <StatusPill status={info.approval_status} /> : null}
            </View>
            {info.approval_status === 'PENDING_APPROVAL' ? <Text style={{ color: t.warning, fontSize: 14, fontWeight: '600' }}>Waiting for platform approval. You will be able to make the tournament public once it is approved.</Text> : null}
            {info.approval_status === 'REJECTED' && info.approval_rejection_reason ? <Text style={{ color: t.danger, fontSize: 14 }}>{info.approval_rejection_reason}</Text> : null}
            {info.description ? <Text style={{ color: t.textSecondary, fontSize: 15, lineHeight: 22 }}>{info.description}</Text> : null}
            <Text style={{ color: t.textMuted, fontSize: 13 }}>{info.format ? `${info.format[0]}${info.format.slice(1).toLowerCase()}` : 'Tournament'} · manage settings, participants and fixtures from here.</Text>
          </View>

          {info.approval_status === 'REJECTED' || (info.approval_status === 'APPROVED' && !info.approval_submitted_at && info.status === 'DRAFT') ? (
            <Button tone="secondary" title={info.approval_status === 'REJECTED' ? 'Edit and resubmit for approval' : 'Submit for approval'} loading={busy} onPress={() => void submitApproval()} />
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {tile('Players', counts.players)}
            {tile('Waiting', counts.pending)}
            {tile('Teams', counts.teams)}
            {tile('Fixtures', counts.fixtures)}
          </View>

          {open || canReopen ? (
            <View style={[portalCard(t), { gap: 10 }]}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Registration status</Text>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>{open ? 'Registration is open. Players and teams can register.' : 'Registration is closed.'}</Text>
              {open && !confirming ? <Button tone="secondary" title="Close registration" onPress={() => setConfirming(true)} /> : null}
              {open && confirming ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ color: t.textSecondary, fontSize: 14 }}>Close registration and move to preparation?</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}><Button tone="secondary" title="Keep open" onPress={() => setConfirming(false)} /></View>
                    <View style={{ flex: 1 }}><Button title="Confirm close" loading={busy} onPress={() => void setRegistration(false)} /></View>
                  </View>
                </View>
              ) : null}
              {!open ? <Button title="Reopen registration" loading={busy} onPress={() => void setRegistration(true)} /> : null}
            </View>
          ) : null}

          <Section title="Manage">
            {nav('Participants', `${counts.pending} waiting for a decision`, Users, '/organizer/[id]/participants')}
            {info.format === 'LEAGUE' && info.league_mode === 'AUCTION' ? nav('Lot Draw', 'Run the icon and setter lot draws', Gavel, '/organizer/[id]/lot') : null}
            {info.format === 'LEAGUE' && info.league_mode === 'AUCTION' ? nav('Auction Control', 'Prepare and run the live player auction', Gavel, '/organizer/[id]/auction') : null}
            {nav('Fixtures & Scorers', 'Stages, schedule, scorers and results', Calendar, '/organizer/[id]/fixtures')}
            {nav('Settings', 'Details, registration, squads and match format', Settings, '/organizer/[id]/settings')}
          </Section>
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/t/[slug]', params: { slug: info.slug } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
            <ClipboardList size={16} color={t.primary} />
            <Text style={{ color: t.primary, fontSize: 14, fontWeight: '600' }}>View public page</Text>
          </Pressable>
        </>
      )}
    </OrganizerFrame>
  );
}
