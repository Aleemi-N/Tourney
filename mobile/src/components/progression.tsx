import { useState } from 'react';
import { View } from 'react-native';
import { Choice } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { PRESET_OPTIONS, presetRuleArgs, type PresetKey } from '@/lib/rules';
import { requestKey } from '@/lib/lot';
import { tint, useTheme } from '@/theme';

type Standing = { rank: number; team_id: string; team_name: string; league_points: number };
type Preview = { standings: Standing[]; matches: { label: string; home?: Standing; away?: Standing; home_source?: string; away_source?: string }[] };

const DECISIONS = [
  { value: 'FINISH_AFTER_LEAGUE', label: 'Finish tournament' },
  { value: 'TOP_2_FINAL', label: 'Top 2 → Final' },
  { value: 'TOP_4_SEMIFINALS', label: 'Top 4 → Semi finals' },
];

/** Shown when a league stage is complete: preview what happens next, then confirm. */
export function Progression({ tournamentId, stageId, onDone }: { tournamentId: string; stageId: string; onDone: (message: string) => Promise<void> }) {
  const t = useTheme();
  const [decision, setDecision] = useState('FINISH_AFTER_LEAGUE');
  const [thirdPlace, setThirdPlace] = useState<'yes' | 'no'>('no');
  const [format, setFormat] = useState<PresetKey>('BO3');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [key, setKey] = useState(requestKey());
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finish = decision === 'FINISH_AFTER_LEAGUE';

  const reset = () => { setPreview(null); setConfirming(false); setKey(requestKey()); };

  async function runPreview() {
    setBusy('preview'); setError(null);
    const { data, error: e } = await api.rpc('preview_league_progression', { p_stage_id: stageId, p_decision: decision, p_include_third_place: !finish && thirdPlace === 'yes' });
    setBusy(null);
    if (e) { setPreview(null); return setError(e.message); }
    setPreview(data as unknown as Preview);
  }

  async function apply() {
    setBusy('apply'); setError(null); setConfirming(false);
    const { data, error: e } = await api.rpc('apply_league_progression', { p_stage_id: stageId, p_decision: decision, p_include_third_place: !finish && thirdPlace === 'yes', p_idempotency_key: key });
    const target = (data as { target_stage_id?: string | null } | null)?.target_stage_id;
    const formatError = !e && target ? (await api.rpc('save_volleyball_rule', presetRuleArgs(tournamentId, target, format))).error : null;
    setBusy(null);
    if (e) return setError(e.message);
    reset();
    await onDone(formatError ? `Next stage created, but its format was not saved: ${formatError.message}` : 'Progression applied.');
  }

  return (
    <View style={[portalCard(t), { gap: 14, borderColor: t.success, backgroundColor: tint(t.success, 0.06) }]}>
      <View style={{ gap: 2 }}>
        <Text style={{ color: t.success, fontSize: 12, fontWeight: '900', letterSpacing: 2 }}>LEAGUE STAGE COMPLETE</Text>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>What happens next?</Text>
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Choice label="Decision" value={decision} options={DECISIONS} onChange={(v) => { setDecision(v); setThirdPlace('no'); reset(); }} />
      {!finish ? (
        <>
          <Choice label="Third place match" value={thirdPlace} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Include' }]} onChange={(v) => { setThirdPlace(v); reset(); }} />
          <Choice label="Next stage format" value={format} options={PRESET_OPTIONS} onChange={setFormat} />
        </>
      ) : null}
      <Button tone="secondary" title="Preview Decision" loading={busy === 'preview'} disabled={busy !== null} onPress={() => void runPreview()} />

      {preview ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 }}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>Final standings</Text>
          {preview.standings.slice(0, 4).map((row) => <Text key={row.team_id} style={{ color: t.textSecondary, fontSize: 14 }}>{row.rank}. {row.team_name} · {row.league_points} pts</Text>)}
          {preview.matches.map((m) => (
            <View key={m.label} style={{ borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, gap: 2 }}>
              <Text style={{ color: t.primary, fontSize: 12, fontWeight: '900' }}>{m.label}</Text>
              <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>{m.home?.team_name ?? m.home_source} vs {m.away?.team_name ?? m.away_source}</Text>
            </View>
          ))}
          {!confirming ? <Button title={finish ? 'Confirm & Finish Tournament' : 'Confirm & Create Next Stage'} disabled={busy !== null} onPress={() => setConfirming(true)} /> : (
            <View style={{ gap: 8 }}>
              <Text style={{ color: t.text, fontSize: 14 }}>Confirm this authoritative progression decision? It cannot be undone.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setConfirming(false)} /></View>
                <View style={{ flex: 1 }}><Button title="Confirm" loading={busy === 'apply'} onPress={() => void apply()} /></View>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
