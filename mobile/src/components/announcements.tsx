import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

export type Announcement = { id: string; team_id: string | null; team_name: string | null; title: string; body: string; created_at: string };

/** Announcements of a tournament the signed-in user may read (public ones, plus those for their own team). */
export function useAnnouncements(tournamentId: string | undefined) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const reload = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await api.rpc('get_announcements', { p_tournament_id: tournamentId });
    setItems((data ?? []) as unknown as Announcement[]);
  }, [tournamentId]);
  useEffect(() => { void reload(); }, [reload]);
  return { items, reload };
}

export const announcementTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** The latest announcements as cards. Renders nothing when there are none. */
export function AnnouncementsCard({ tournamentId, limit = 3 }: { tournamentId: string | undefined; limit?: number }) {
  const t = useTheme();
  const { items } = useAnnouncements(tournamentId);
  if (!items || items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Announcements</Text>
      {items.slice(0, limit).map((a) => (
        <View key={a.id} style={{ borderRadius: radius.xl, borderWidth: 1, borderColor: tint(t.primary, 0.3), backgroundColor: tint(t.primary, 0.06), padding: 14, gap: 4 }}>
          <Text style={{ color: t.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{a.team_name ? `For ${a.team_name}` : 'Announcement'} · {announcementTime(a.created_at)}</Text>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{a.title}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 14, lineHeight: 20 }}>{a.body}</Text>
        </View>
      ))}
    </View>
  );
}
