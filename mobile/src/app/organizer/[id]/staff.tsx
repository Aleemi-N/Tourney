import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type Person = { user_id: string; display_name: string; email: string | null; roles: string[]; membership_status: string; is_primary_organizer: boolean };
type Result = { ok?: boolean; code?: string } | null;

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Enter a valid email address.',
  ACCOUNT_NOT_FOUND: 'No Tourny account was found for this email.',
  ACCOUNT_NOT_AVAILABLE: 'This Tourny account is not available.',
  AMBIGUOUS_EMAIL: 'This email cannot be used for staff access. Contact support.',
  ROLE_ALREADY_ASSIGNED: 'This person already has that role.',
  ROLE_NOT_ASSIGNED: 'That role is no longer assigned.',
  PRIMARY_ORGANIZER_PROTECTED: "The primary organizer's Organizer role cannot be removed.",
  UNSUPPORTED_ROLE: 'Choose Organizer or Scorer.',
  UNAUTHORIZED: 'You do not have permission to manage this tournament.',
};
const roleLabel = (r: string) => (r === 'ORGANIZER' ? 'Organizer' : r === 'SCORER' ? 'Scorer' : r);

/** Organizers and scorers who can work on this tournament. */
export default function OrganizerStaff() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [staff, setStaff] = useState<Person[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ORGANIZER' | 'SCORER'>('SCORER');
  const [remove, setRemove] = useState<{ userId: string; role: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.rpc('get_tournament_staff', { p_tournament_id: id });
    if (error) return setMessage({ error: true, text: error.message });
    setStaff(data as unknown as Person[]);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const explain = (r: Result, fallback: string) => (r?.code ? MESSAGES[r.code] ?? fallback : fallback);

  async function add() {
    setBusy(true); setMessage(null);
    const { data, error } = await api.rpc('add_tournament_staff_role', { p_tournament_id: id, p_email: email.trim(), p_role: role });
    setBusy(false);
    const r = data as Result;
    if (error || !r?.ok) return setMessage({ error: true, text: explain(r, 'Unable to add staff right now.') });
    setEmail(''); setAdding(false);
    setMessage({ error: false, text: `${roleLabel(role)} role added.` });
    await load();
  }

  async function confirmRemove() {
    if (!remove) return;
    setBusy(true); setMessage(null);
    const { data, error } = await api.rpc('remove_tournament_staff_role', { p_tournament_id: id, p_target_user_id: remove.userId, p_role: remove.role });
    setBusy(false);
    const r = data as Result;
    if (error || !r?.ok) return setMessage({ error: true, text: explain(r, 'Unable to remove this role right now.') });
    setRemove(null);
    setMessage({ error: false, text: 'Staff role removed.' });
    await load();
  }

  return (
    <OrganizerFrame id={id} current="staff" title="Tournament Staff" subtitle={name}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Manage organizers and scorers who can access this tournament.</Text>
      {message ? (message.error ? <ErrorText>{message.text}</ErrorText> : <Text accessibilityRole="alert" style={{ color: t.success, fontSize: 14, fontWeight: '600' }}>{message.text}</Text>) : null}
      {!adding ? <Button title="Add Staff" onPress={() => setAdding(true)} /> : (
        <View style={[portalCard(t), { gap: 14 }]}>
          <View style={{ gap: 2 }}>
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Add tournament staff</Text>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>Enter the exact email used by an existing Tourny account.</Text>
          </View>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="person@example.com" />
          <Choice label="Role" value={role} options={[{ value: 'SCORER', label: 'Scorer' }, { value: 'ORGANIZER', label: 'Organizer' }]} onChange={setRole} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Button title="Add" loading={busy} disabled={!email.includes('@')} onPress={() => void add()} /></View>
          </View>
        </View>
      )}
      {!staff ? <Loading /> : staff.length === 0 ? <Empty text="No staff yet." /> : staff.map((person) => (
        <View key={person.user_id} style={[portalCard(t), { gap: 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(t.primary, 0.1) }}>
              <Text style={{ color: t.primary, fontSize: 16, fontWeight: '800' }}>{(person.display_name ?? '?').slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{person.display_name}{person.is_primary_organizer ? '  ·  Primary organizer' : ''}</Text>
              {person.email ? <Text style={{ color: t.textMuted, fontSize: 13 }}>{person.email}</Text> : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {person.roles.map((r) => {
              const locked = person.is_primary_organizer && r === 'ORGANIZER';
              return (
                <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: tint(t.primary, 0.1) }}>
                    <Text style={{ color: t.primary, fontSize: 12, fontWeight: '700' }}>{roleLabel(r)}</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${roleLabel(r)} role from ${person.display_name}`} disabled={locked || busy} onPress={() => setRemove({ userId: person.user_id, role: r })}
                    style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', borderRadius: radius.xl, opacity: locked ? 0.4 : 1 }}>
                    <Text style={{ color: t.danger, fontSize: 13, fontWeight: '600' }}>Remove</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {remove?.userId === person.user_id ? (
            <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 }}>
              <Text style={{ color: t.textSecondary, fontSize: 14 }}>Remove only the {roleLabel(remove.role)} role from {person.display_name}?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Keep" onPress={() => setRemove(null)} /></View>
                <View style={{ flex: 1 }}><Button tone="danger-outline" title="Remove role" loading={busy} onPress={() => void confirmRemove()} /></View>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </OrganizerFrame>
  );
}
