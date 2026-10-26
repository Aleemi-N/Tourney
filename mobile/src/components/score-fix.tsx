import { PencilLine, RotateCcw } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/form';
import { Text } from '@/components/text';
import { Button, Card, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type FixSet = { set_number: number; status: string; home_score: number; away_score: number };

/** Fix a wrong score: correct the latest set, or reset the whole match. Both need a reason and are audited. */
export function ScoreFix({ matchId, sets, homeName, awayName, disabled, onChanged }: { matchId: string; sets: FixSet[]; homeName: string; awayName: string; disabled: boolean; onChanged: () => Promise<void> }) {
  const t = useTheme();
  const latest = [...sets].reverse().find((s) => s.status !== 'PENDING' || s.home_score + s.away_score > 0);
  const [mode, setMode] = useState<'correct' | 'reset' | null>(null);
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(next: 'correct' | 'reset') {
    setHome(String(latest?.home_score ?? 0));
    setAway(String(latest?.away_score ?? 0));
    setReason('');
    setError(null);
    setMode(next);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    const { error: e } = mode === 'reset'
      ? await api.rpc('reset_match', { p_match_id: matchId, p_reason: reason })
      : await api.rpc('correct_set_score', { p_match_id: matchId, p_set_number: latest!.set_number, p_home_score: Number(home), p_away_score: Number(away), p_reason: reason });
    setSaving(false);
    if (e) return setError(e.message);
    setMode(null);
    await onChanged();
  }

  const valid = reason.trim() !== '' && (mode === 'reset' || (/^\d+$/.test(home) && /^\d+$/.test(away)));

  if (!mode) {
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button tone="secondary" title="Correct score" disabled={disabled || !latest} icon={<PencilLine size={16} color={t.text} />} onPress={() => open('correct')} /></View>
        <View style={{ flex: 1 }}><Button tone="danger-outline" title="Reset match" disabled={disabled || !latest} icon={<RotateCcw size={16} color={t.danger} />} onPress={() => open('reset')} /></View>
      </View>
    );
  }
  return (
    <Card style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{mode === 'reset' ? 'Reset this match?' : `Correct set ${latest?.set_number ?? ''} score`}</Text>
      {mode === 'reset' ? (
        <Text style={{ color: t.textSecondary, fontSize: 14 }}>Every set goes back to 0 – 0 and the match returns to Scheduled. Any result it already produced (standings, bracket places) is taken back.</Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field label={homeName} value={home} onChangeText={setHome} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field label={awayName} value={away} onChangeText={setAway} keyboardType="number-pad" /></View>
        </View>
      )}
      <Field label="Reason" value={reason} onChangeText={setReason} />
      <Text style={{ color: t.textMuted, fontSize: 12 }}>Kept in the audit log. A completed match can only be changed by an organizer.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" disabled={saving} onPress={() => setMode(null)} /></View>
        <View style={{ flex: 1 }}><Button tone={mode === 'reset' ? 'danger-outline' : 'primary'} title={mode === 'reset' ? 'Reset match' : 'Save correction'} loading={saving} disabled={!valid} onPress={() => void submit()} /></View>
      </View>
    </Card>
  );
}
