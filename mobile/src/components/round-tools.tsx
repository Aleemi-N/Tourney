import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { initialPlan, interleaveMatchesForMaxRest, LOCKED, nextDate, split, timeAt, ymd, type Day, type PlanDefaults, type PlanMatch } from '@/lib/schedule';
import { radius, useTheme } from '@/theme';

type Item = PlanMatch & { match_number: number | null };

/** Auto-spread rest, manual reorder and day planning for the matches of one stage round. */
export function RoundTools({ tournamentId, stageId, stageName, round, items, revision, defaults, onDone }: {
  tournamentId: string; stageId: string | null; stageName: string; round: number | null; items: Item[]; revision: number | null; defaults: PlanDefaults; onDone: (message: string) => Promise<void>;
}) {
  const t = useTheme();
  const [mode, setMode] = useState<'reorder' | 'plan' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Item[]>(items);
  const [plan, setPlan] = useState(() => initialPlan(items, defaults));
  const [progress, setProgress] = useState<string | null>(null);

  async function saveOrder(next: Item[]) {
    if (revision === null) return setError('Ordering scope unavailable. Refresh and try again.');
    setBusy(true); setError(null);
    const { error: e } = await api.rpc('reorder_matches', { p_tournament_id: tournamentId, p_stage_id: stageId as string, p_round_number: round as number, p_ordered_match_ids: next.map((m) => m.id), p_expected_revision: revision });
    setBusy(false);
    if (e) {
      setError(e.message.includes('Stale') ? 'Order changed elsewhere. Loading the authoritative order.' : e.message);
      return void onDone('');
    }
    setMode(null);
    await onDone('Match order saved.');
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
  }

  const slots: { match: Item; at: Date }[] = [];
  let k = 0;
  plan.days.forEach((day) => { for (let i = 0; i < day.count && k < items.length; i++) slots.push({ match: items[k++], at: timeAt(day, i, plan.minutes) }); });
  const assigned = plan.days.reduce((sum, d) => sum + d.count, 0);
  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const timeOk = (s: string) => /^\d{2}:\d{2}$/.test(s);
  const valid = assigned === items.length && plan.days.every((d) => dateOk(d.date) && timeOk(d.start) && d.count >= 0) && plan.minutes > 0;

  function setDayCount(n: number) {
    const count = Math.min(7, Math.max(1, n));
    const counts = split(items.length, count);
    setPlan((p) => {
      const days: Day[] = [];
      for (let i = 0; i < count; i++) {
        const prev = p.days[i] ?? { date: nextDate(days[i - 1]?.date ?? ymd(new Date())), start: days[i - 1]?.start ?? '09:00', count: 0 };
        days.push({ ...prev, count: counts[i] });
      }
      return { ...p, days };
    });
  }
  const updateDay = (i: number, patch: Partial<Day>) => setPlan((p) => ({ ...p, days: p.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));

  async function savePlan() {
    setError(null);
    const todo = slots.filter((s) => !LOCKED.includes(s.match.status));
    for (const [i, s] of todo.entries()) {
      setProgress(`Saving ${i + 1} of ${todo.length}…`);
      const { error: e } = await api.rpc('update_match_schedule', { p_match_id: s.match.id, p_scheduled_at: s.at.toISOString(), p_venue: s.match.venue ?? undefined, p_court: s.match.court ?? undefined, p_status: undefined as unknown as string });
      if (e) { setProgress(null); return setError(`Stopped at ${s.match.home_team?.name ?? 'TBD'} vs ${s.match.away_team?.name ?? 'TBD'}: ${e.message}`); }
    }
    setProgress(null);
    setMode(null);
    await onDone(`Scheduled ${todo.length} matches across ${plan.days.length} day${plan.days.length > 1 ? 's' : ''}.`);
  }

  const chip = (label: string, onPress: () => void, tone: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${stageName}${round ? ` round ${round}` : ''}`} disabled={busy} onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: radius.xl, borderWidth: 1, borderColor: tone, justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
      <Text style={{ color: tone, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chip('Auto-Spread Rest', () => void saveOrder(interleaveMatchesForMaxRest(items)), t.success)}
        {chip(`Easy Reorder (${items.length})`, () => { setOrder(items); setError(null); setMode(mode === 'reorder' ? null : 'reorder'); }, t.primary)}
        {chip('Plan Days', () => { setPlan(initialPlan(items, defaults)); setError(null); setMode(mode === 'plan' ? null : 'plan'); }, t.info)}
      </View>
      {error ? <ErrorText>{error}</ErrorText> : null}

      {mode === 'reorder' ? (
        <View style={[portalCard(t), { gap: 8 }]}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Reorder matches</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>Move matches up or down, then save. Played matches can move too, but their results stay.</Text>
          {order.map((m, i) => (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surfaceMuted, borderRadius: radius.xl, paddingLeft: 12 }}>
              <Text style={{ width: 22, color: t.textMuted, fontWeight: '800' }}>{i + 1}</Text>
              <Text numberOfLines={2} style={{ flex: 1, color: t.text, fontSize: 14, fontWeight: '600' }}>{m.home_team?.name ?? 'TBD'} vs {m.away_team?.name ?? 'TBD'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move match ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.3 : 1 }}><ArrowUp size={18} color={t.text} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move match ${i + 1} down`} disabled={i === order.length - 1} onPress={() => move(i, 1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === order.length - 1 ? 0.3 : 1 }}><ArrowDown size={18} color={t.text} /></Pressable>
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setMode(null)} /></View>
            <View style={{ flex: 1 }}><Button title="Save order" loading={busy} onPress={() => void saveOrder(order)} /></View>
          </View>
        </View>
      ) : null}

      {mode === 'plan' ? (
        <View style={[portalCard(t), { gap: 12 }]}>
          <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Plan days · {stageName}</Text>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>Spread {items.length} matches over the days below. Matches already played or live are not changed.</Text>
          <Field label="Number of days" value={String(plan.days.length)} onChangeText={(v) => setDayCount(Number(v) || 1)} keyboardType="number-pad" />
          <Field label="Minutes per match" value={String(plan.minutes)} onChangeText={(v) => setPlan({ ...plan, minutes: Math.max(0, Number(v) || 0) })} keyboardType="number-pad" />
          {plan.days.map((d, i) => (
            <View key={i} style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 10 }}>
              <Text style={{ color: t.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>DAY {i + 1}</Text>
              <Field label="Date (YYYY-MM-DD)" value={d.date} onChangeText={(v) => updateDay(i, { date: v })} autoCapitalize="none" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="First match (HH:MM)" value={d.start} onChangeText={(v) => updateDay(i, { start: v })} autoCapitalize="none" /></View>
                <View style={{ flex: 1 }}><Field label="Matches" value={String(d.count)} onChangeText={(v) => updateDay(i, { count: Math.max(0, Number(v) || 0) })} keyboardType="number-pad" /></View>
              </View>
            </View>
          ))}
          <Text style={{ color: valid ? t.textSecondary : t.warning, fontSize: 13 }}>{assigned} of {items.length} matches assigned{valid ? '' : '. Every match needs a slot and valid dates and times.'}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setMode(null)} /></View>
            <View style={{ flex: 1 }}><Button title={progress ?? 'Save schedule'} loading={progress !== null} disabled={!valid || progress !== null} onPress={() => void savePlan()} /></View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
