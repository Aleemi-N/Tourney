import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Choice, Field } from '@/components/form';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Award = { id: string; name: string; player_id: string; player_name: string; note: string | null };
type Player = { id: string; name: string };

const SUGGESTIONS = ['Tournament MVP', 'Best Setter', 'Best Libero', 'Best Server', 'Best Blocker', 'Best Attacker', 'Emerging Player'];

/** Tournament awards: MVP, best setter and the rest. They show on the public tournament and player pages. */
export default function OrganizerAwards() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const tournamentName = useTournamentName(id);
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [player, setPlayer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      api.rpc('get_tournament_awards', { p_tournament_id: id }),
      api.from('player_tournament_registrations').select('player_id,player_profiles(id,display_name)').eq('tournament_id', id).eq('status', 'APPROVED'),
    ]);
    setAwards((a.data ?? []) as unknown as Award[]);
    setPlayers(((r.data ?? []) as unknown as { player_profiles: { id: string; display_name: string } | null }[]).filter((x) => x.player_profiles).map((x) => ({ id: x.player_profiles!.id, name: x.player_profiles!.display_name })).sort((x, y) => x.name.localeCompare(y.name)));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    setBusy(true); setError(null);
    const { error: e } = await api.rpc('set_tournament_award', { p_tournament_id: id, p_name: name.trim(), p_player_id: player, p_note: note.trim() || undefined });
    setBusy(false);
    if (e) return setError(e.message);
    setName(''); setNote(''); setPlayer(''); setSearch('');
    await load();
  }

  const matches = players.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 12);

  return (
    <OrganizerFrame id={id} current="awards" title="Awards" subtitle={tournamentName}>
      <Text style={{ color: t.textSecondary, fontSize: 15 }}>Give out tournament awards. The player of each match is chosen by the scorer when the match ends.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}

      <View style={[portalCard(t), { gap: 12 }]}>
        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Add or change an award</Text>
        <Choice label="Common awards" value={SUGGESTIONS.includes(name) ? name : ''} options={SUGGESTIONS.map((s) => ({ value: s, label: s }))} onChange={setName} />
        <Field label="Award name" value={name} onChangeText={setName} maxLength={60} />
        <Field label="Find a player" value={search} onChangeText={setSearch} autoCapitalize="none" />
        <Choice label="Player" value={player} onChange={setPlayer} options={matches.map((p) => ({ value: p.id, label: p.name }))} />
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={200} />
        <Button title="Save award" loading={busy} disabled={!name.trim() || !player} onPress={() => void save()} />
      </View>

      {awards === null ? <Loading /> : awards.length === 0 ? <Empty text="No awards yet." /> : awards.map((a) => (
        <View key={a.id} style={[portalCard(t), { gap: 6 }]}>
          <Text style={{ color: t.warning, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>{a.name}</Text>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{a.player_name}</Text>
          {a.note ? <Text style={{ color: t.textSecondary, fontSize: 13 }}>{a.note}</Text> : null}
          <Button tone="danger-outline" title="Remove" accessibilityLabel={`Remove ${a.name}`} disabled={busy} onPress={() => { setBusy(true); void api.rpc('remove_tournament_award', { p_award_id: a.id }).then(() => { setBusy(false); return load(); }); }} />
        </View>
      ))}
    </OrganizerFrame>
  );
}
