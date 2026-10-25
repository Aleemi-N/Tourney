'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Trophy, Settings2 } from 'lucide-react';

type SetRule = { set_number: number; target_points: number };
type VolleyballRule = {
  id: string;
  stage_id: string | null;
  sets_to_win: number;
  win_by_two: boolean;
  set_rules: SetRule[];
};

export const PRESETS = {
  BO1: { label: 'Best of 1', setsToWin: 1, sets: [25] },
  BO3: { label: 'Best of 3', setsToWin: 2, sets: [25, 25, 15] },
  BO5: { label: 'Best of 5', setsToWin: 3, sets: [25, 25, 25, 25, 15] },
};
export type PresetKey = keyof typeof PRESETS;

/** Arguments for save_volleyball_rule with a standard preset. */
export function presetRuleArgs(tournamentId: string, stageId: string | null, key: PresetKey) {
  const preset = PRESETS[key];
  return {
    p_tournament_id: tournamentId,
    p_stage_id: stageId as string,
    p_sets_to_win: preset.setsToWin,
    p_win_by_two: true,
    p_set_rules: preset.sets.map((target_points, index) => ({ set_number: index + 1, target_points })) as unknown as string,
  };
}

function detectPreset(rule: VolleyballRule): PresetKey {
  if (rule.sets_to_win === 1) return 'BO1';
  if (rule.sets_to_win === 3) return 'BO5';
  return 'BO3';
}

function StageFormatEditor({
  tournamentId,
  stageId,
  stageName,
  rule,
  fallback,
}: {
  tournamentId: string;
  stageId: string | null;
  stageName: string;
  rule?: VolleyballRule;
  fallback?: VolleyballRule;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<PresetKey | null>(rule ? detectPreset(rule) : null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function save(key: PresetKey) {
    setSaving(true);
    setMessage(null);
    const { error } = await createClient().rpc('save_volleyball_rule', presetRuleArgs(tournamentId, stageId, key));
    setSaving(false);
    if (error) {
      setMessage({ tone: 'danger', text: error.message });
      return;
    }
    setSelected(key);
    setMessage({ tone: 'success', text: 'Saved. Matches that have not started now use this format.' });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Trophy className="h-4 w-4" />
        </div>
        <div>
          <p className="font-semibold text-text-primary">{stageName}</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {stageId === null
              ? 'Default format for all matches in this tournament'
              : selected
                ? `Format for matches played in the ${stageName}`
                : `Uses the default (${PRESETS[fallback ? detectPreset(fallback) : 'BO3'].label}) until you pick one`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
          <button
            key={key}
            disabled={saving}
            aria-pressed={selected === key}
            onClick={() => void save(key)}
            className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-center font-bold transition-all text-sm ${
              selected === key
                ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary/50'
                : 'border-border text-text-secondary hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            <span className="text-base font-black">{PRESETS[key].label}</span>
            <span className="text-xs font-normal opacity-70">
              {PRESETS[key].sets.join(' · ')} pts
            </span>
          </button>
        ))}
      </div>

      {saving && <p className="mt-2 text-xs text-text-secondary">Saving…</p>}
      {message && (
        <p role="status" className={`mt-2 text-xs ${message.tone === 'success' ? 'text-success' : 'text-danger'}`}>{message.text}</p>
      )}
    </div>
  );
}

export function MatchFormatSection({
  tournamentId,
  stages,
  rules,
}: {
  tournamentId: string;
  stages: Array<{ id: string; name: string }>;
  rules: VolleyballRule[];
}) {
  const [open, setOpen] = useState(false);
  const rulesByStage = new Map(rules.map((r) => [r.stage_id ?? 'default', r]));
  const defaultRule = rulesByStage.get('default');

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Match Format</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            How many sets does a team need to win each match? Changes apply to matches that have not started; change a single match from its fixture card.
          </p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
        >
          <Settings2 className="h-4 w-4" />
          {open ? 'Hide' : 'Configure'}
        </button>
      </div>

      {open && (
        <div className="space-y-3">
          <StageFormatEditor
            tournamentId={tournamentId}
            stageId={null}
            stageName="Default (All matches)"
            rule={defaultRule}
          />
          {stages.map((stage) => (
            <StageFormatEditor
              key={stage.id}
              tournamentId={tournamentId}
              stageId={stage.id}
              stageName={stage.name}
              rule={rulesByStage.get(stage.id)}
              fallback={defaultRule}
            />
          ))}
        </div>
      )}

      {!open && (
        <div className="flex flex-wrap gap-2">
          {[
            { id: null as string | null, name: 'Default' },
            ...stages.map((s) => ({ id: s.id, name: s.name })),
          ].map(({ id, name }) => {
            const rule = rulesByStage.get(id ?? 'default') ?? defaultRule;
            return (
              <span
                key={id ?? 'default'}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
              >
                <span className="text-text-secondary">{name}: </span>
                <span className="font-bold text-text-primary">{rule ? PRESETS[detectPreset(rule)].label : 'Not set'}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
