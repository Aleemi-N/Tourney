import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

export type RegistrationStatus = {
  closes_at: string | null; timezone: string; open: boolean; max_players: number | null; players_approved: number; player_spots_left: number | null; waitlist: number;
  max_teams: number | null; teams: number; born_on_or_after: string | null; born_on_or_before: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-05 18:00" in this phone's time, the way the organizer types it. */
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Registration deadline, player limit with waitlist, and age category, for the tournament settings. */
export function RegistrationLimits({ tournamentId }: { tournamentId: string }) {
  const t = useTheme();
  const [form, setForm] = useState<{ closes: string; max: string; after: string; before: string } | null>(null);
  const [status, setStatus] = useState<RegistrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.rpc('get_registration_status', { p_tournament_id: tournamentId });
    const s = data as unknown as RegistrationStatus | null;
    setStatus(s);
    setForm({ closes: toLocal(s?.closes_at ?? null), max: s?.max_players ? String(s.max_players) : '', after: s?.born_on_or_after ?? '', before: s?.born_on_or_before ?? '' });
  }, [tournamentId]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!form) return;
    setError(null); setOk(null);
    const closes = form.closes.trim();
    let closesAt: string | null = null;
    if (closes) {
      const d = new Date(closes.replace(' ', 'T'));
      if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(closes) || Number.isNaN(d.getTime())) return setError('Write the deadline like 2026-11-05 18:00, or leave it empty for no deadline.');
      closesAt = d.toISOString();
    }
    if ((form.after && !DATE.test(form.after)) || (form.before && !DATE.test(form.before))) return setError('Write dates like 2008-01-01, or leave them empty.');
    setBusy(true);
    const { error: e } = await api.rpc('set_registration_limits', { p_tournament_id: tournamentId, p_closes_at: closesAt, p_max_players: form.max.trim() ? Number(form.max) : null, p_born_after: form.after.trim() || null, p_born_before: form.before.trim() || null });
    setBusy(false);
    if (e) return setError(e.message);
    setOk('Saved.');
    await load();
  }

  if (!form) return <Loading />;
  return (
    <View style={[portalCard(t), { gap: 12 }]}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>All optional. Leave a field empty for no limit. Registration stops at the deadline. When the player limit is reached, new players join a waitlist and move up as you approve or remove people or raise the limit. Teams use the team limit in the tournament rules.</Text>
      {status ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{status.players_approved} approved{status.max_players ? ` of ${status.max_players}` : ''}{status.waitlist ? ` · ${status.waitlist} on the waitlist` : ''}</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {ok ? <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{ok}</Text> : null}
      <Field label="Registration closes (your phone's time)" value={form.closes} onChangeText={(v) => setForm({ ...form, closes: v })} placeholder="2026-11-05 18:00" autoCapitalize="none" autoCorrect={false} />
      <Field label="Player limit" value={form.max} onChangeText={(v) => setForm({ ...form, max: v.replace(/[^0-9]/g, '') })} keyboardType="number-pad" placeholder="No limit" />
      <Field label="Born on or after (age category)" value={form.after} onChangeText={(v) => setForm({ ...form, after: v })} placeholder="2008-01-01 for Under-19" autoCapitalize="none" autoCorrect={false} />
      <Field label="Born on or before (optional)" value={form.before} onChangeText={(v) => setForm({ ...form, before: v })} placeholder="2012-12-31" autoCapitalize="none" autoCorrect={false} />
      <Button title="Save limits" loading={busy} disabled={busy} onPress={() => void save()} />
    </View>
  );
}

/** What a person about to register needs to know: the deadline, places left, and who may play. */
export function RegistrationNotice({ tournamentId, kind }: { tournamentId: string; kind: 'PLAYER' | 'TEAM' }) {
  const t = useTheme();
  const [s, setS] = useState<RegistrationStatus | null>(null);
  useEffect(() => {
    api.rpc('get_registration_status', { p_tournament_id: tournamentId }).then(({ data }) => setS(data as unknown as RegistrationStatus | null));
  }, [tournamentId]);
  if (!s) return null;
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.timezone });
  const day = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const lines: string[] = [];
  if (s.closes_at) lines.push(s.open || new Date(s.closes_at) > new Date() ? `Registration closes on ${when(s.closes_at)}.` : `Registration closed on ${when(s.closes_at)}.`);
  if (kind === 'PLAYER') {
    if (s.max_players) lines.push(s.player_spots_left ? `${s.player_spots_left} of ${s.max_players} places left.` : `All ${s.max_players} places are taken. You can still register and join the waitlist${s.waitlist ? ` (${s.waitlist} waiting)` : ''}.`);
    if (s.born_on_or_after && s.born_on_or_before) lines.push(`Open to players born between ${day(s.born_on_or_after)} and ${day(s.born_on_or_before)}.`);
    else if (s.born_on_or_after) lines.push(`Open to players born on or after ${day(s.born_on_or_after)}.`);
    else if (s.born_on_or_before) lines.push(`Open to players born on or before ${day(s.born_on_or_before)}.`);
  } else if (s.max_teams) lines.push(s.teams < s.max_teams ? `${s.max_teams - s.teams} of ${s.max_teams} team places left.` : 'All team places are taken.');
  if (lines.length === 0) return null;
  return (
    <View accessibilityRole="summary" style={{ borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, padding: 14, gap: 4 }}>
      {lines.map((l) => <Text key={l} style={{ color: t.textSecondary, fontSize: 14 }}>{l}</Text>)}
    </View>
  );
}
