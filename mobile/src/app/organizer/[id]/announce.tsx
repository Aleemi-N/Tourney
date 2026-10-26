import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { announcementTime, useAnnouncements } from '@/components/announcements';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** Send a message to everyone in the tournament or to one team. It shows on the public pages and arrives as a push alert. */
export default function OrganizerAnnounce() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const { items, reload } = useAnnouncements(id);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [audience, setAudience] = useState('ALL');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api.from('teams').select('id,name').eq('tournament_id', id).eq('status', 'ACTIVE').order('name').then(({ data }) => setTeams((data ?? []) as { id: string; name: string }[]));
  }, [id]);

  async function send() {
    setBusy(true); setError(null); setSent(false);
    const { error: e } = await api.rpc('post_announcement', { p_tournament_id: id, p_title: title.trim(), p_body: body.trim(), p_team_id: (audience === 'ALL' ? undefined : audience) as string });
    setBusy(false);
    if (e) return setError(e.message);
    setTitle(''); setBody(''); setSent(true);
    await reload();
  }

  return (
    <OrganizerFrame id={id} current="announce" title="Announcements" subtitle={name}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Tell participants and followers about delays, venue changes or anything else. Everyone who follows the tournament or team gets a notification.</Text>
      <View style={[portalCard(t), { gap: 12 }]}>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {sent ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>Announcement sent.</Text> : null}
        <Choice label="Send to" value={audience} onChange={setAudience} options={[{ value: 'ALL', label: 'Everyone' }, ...teams.map((x) => ({ value: x.id, label: x.name }))]} />
        <Field label="Title" value={title} onChangeText={setTitle} maxLength={80} />
        <Field label="Message" value={body} onChangeText={setBody} maxLength={500} multiline style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>{body.length} / 500</Text>
        <Button title="Send announcement" loading={busy} disabled={!title.trim() || !body.trim()} onPress={() => void send()} />
      </View>
      {items === null ? <Loading /> : items.length === 0 ? <Empty text="No announcements yet." /> : items.map((a) => (
        <View key={a.id} style={[portalCard(t), { gap: 4 }]}>
          <Text style={{ color: t.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{a.team_name ? `For ${a.team_name}` : 'Everyone'} · {announcementTime(a.created_at)}</Text>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{a.title}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>{a.body}</Text>
          <Button tone="danger-outline" title="Delete" accessibilityLabel={`Delete ${a.title}`} onPress={() => void api.rpc('delete_announcement', { p_announcement_id: a.id }).then(reload)} />
        </View>
      ))}
    </OrganizerFrame>
  );
}
