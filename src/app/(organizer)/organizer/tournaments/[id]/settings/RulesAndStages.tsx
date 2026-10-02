'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Stage, VolleyballRule } from './SettingsForm';

type SetRule = { set_number: number; target_points: number };
const presets = { BO3: { setsToWin: 2, sets: [25, 25, 15] }, BO5: { setsToWin: 3, sets: [25, 25, 25, 25, 15] } };

function RuleEditor({ tournamentId, stageId, label, rule }: { tournamentId: string; stageId: string | null; label: string; rule?: VolleyballRule }) {
  const router = useRouter(); const supabase = createClient();
  const initialSets = rule?.set_rules.length ? rule.set_rules : presets.BO3.sets.map((target_points, index) => ({ set_number: index + 1, target_points }));
  const [setsToWin, setSetsToWin] = useState(rule?.sets_to_win ?? 2); const [sets, setSets] = useState<SetRule[]>(initialSets); const [winByTwo, setWinByTwo] = useState(rule?.win_by_two ?? true); const [state, setState] = useState('');
  const preset = setsToWin === 2 && sets.length === 3 ? 'BO3' : setsToWin === 3 && sets.length === 5 ? 'BO5' : 'CUSTOM';
  function choosePreset(value: string) { if (value === 'BO3' || value === 'BO5') { const next = presets[value]; setSetsToWin(next.setsToWin); setSets(next.sets.map((target_points, index) => ({ set_number: index + 1, target_points }))); } }
  async function save() { setState('Saving…'); const { error } = await supabase.rpc('save_volleyball_rule', { p_tournament_id: tournamentId, p_stage_id: stageId as string, p_sets_to_win: setsToWin, p_win_by_two: winByTwo, p_set_rules: (sets as unknown) as string }); setState(error ? error.message : 'Saved'); if (!error) router.refresh(); }
  return <article className="rounded-xl border border-border bg-surface-muted p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-text-primary">{label}</h3><select value={preset} onChange={e => choosePreset(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="BO3">Best of 3</option><option value="BO5">Best of 5</option><option value="CUSTOM">Custom</option></select></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm text-text-secondary">Sets required to win<input type="number" min="1" value={setsToWin} onChange={e => setSetsToWin(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-text-primary" /></label><label className="flex items-center gap-3 self-end rounded-lg bg-surface p-3 text-sm text-text-primary"><input type="checkbox" checked={winByTwo} onChange={e => setWinByTwo(e.target.checked)} className="h-5 w-5 accent-primary" />Win by 2</label></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{sets.map((setRule, index) => <label key={setRule.set_number} className="text-xs text-text-secondary">Set {setRule.set_number}<input aria-label={`Set ${setRule.set_number} target points`} type="number" min="1" value={setRule.target_points} onChange={e => setSets(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, target_points: Number(e.target.value) } : item))} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-text-primary" /></label>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setSets(current => [...current, { set_number: current.length + 1, target_points: 25 }])} className="text-sm font-medium text-primary">+ Add set</button><div className="flex items-center gap-3"><span className="text-xs text-text-secondary">{state}</span><button type="button" onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save rule</button></div></div></article>;
}

export function RulesAndStages({ tournamentId, stages, rules }: { tournamentId: string; stages: Stage[]; rules: VolleyballRule[] }) {
  const rulesByStage = useMemo(() => new Map(rules.map(rule => [rule.stage_id ?? 'default', rule])), [rules]);
  // stages kept in props to avoid TS errors but stage overrides are now managed in Fixtures
  void stages;
  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Volleyball Rules</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Default scoring rules applied to all matches in this tournament. To set different rules per stage (e.g. League vs Semi-Finals), go to the{' '}
          <a href="../fixtures" className="text-primary underline underline-offset-2 hover:opacity-80">Fixtures page</a>.
        </p>
      </div>
      <RuleEditor tournamentId={tournamentId} stageId={null} label="Tournament default" rule={rulesByStage.get('default')} />
    </section>
  );
}
