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

const PRESETS = {
  BO1: { label: 'Best of 1', setsToWin: 1, sets: [25] },
  BO3: { label: 'Best of 3', setsToWin: 2, sets: [25, 25, 15] },
  BO5: { label: 'Best of 5', setsToWin: 3, sets: [25, 25, 25, 25, 15] },
};

function detectPreset(rule: VolleyballRule): string {
  if (rule.sets_to_win === 1) return 'BO1';
  if (rule.sets_to_win === 2 && rule.set_rules.length === 3) return 'BO3';
  if (rule.sets_to_win === 3 && rule.set_rules.length === 5) return 'BO5';
  return 'BO3';
}

function StageFormatEditor({
  tournamentId,
  stageId,
  stageName,
  rule,
}: {
  tournamentId: string;
  stageId: string | null;
  stageName: string;
  rule?: VolleyballRule;
}) {
  const router = useRouter();
  const supabase = createClient();

  const initial = rule
    ? detectPreset(rule)
    : 'BO3';

  const [selected, setSelected] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(presetKey: string) {
    setSaving(true);
    setSaved(false);
    const preset = PRESETS[presetKey as keyof typeof PRESETS];
    const setRules = preset.sets.map((target_points, index) => ({
      set_number: index + 1,
      target_points,
    }));
    const { error } = await supabase.rpc('save_volleyball_rule', {
      p_tournament_id: tournamentId,
      p_stage_id: stageId as string,
      p_sets_to_win: preset.setsToWin,
      p_win_by_two: true,
      p_set_rules: setRules as unknown as string,
    });
    setSaving(false);
    if (!error) {
      setSaved(true);
      router.refresh();
    }
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
              : `Format for matches played in the ${stageName}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            disabled={saving}
            onClick={() => {
              setSelected(key);
              void save(key);
            }}
            className={`flex flex-col items-center gap-1 rounded-xl border py-3 px-2 text-center font-bold transition-all text-sm ${
              selected === key
                ? 'border-primary bg-primary/15 text-primary ring-1 ring-primary/50'
                : 'border-border text-text-secondary hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            <span className="text-base font-black">{preset.label}</span>
            <span className="text-xs font-normal opacity-70">
              {preset.sets.join(' · ')} pts
            </span>
          </button>
        ))}
      </div>

      {saved && (
        <p className="mt-2 text-xs text-success">✓ Saved!</p>
      )}
      {saving && (
        <p className="mt-2 text-xs text-text-secondary">Saving…</p>
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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Match Format</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            How many sets does a team need to win each match?
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
          {/* Default — always shown */}
          <StageFormatEditor
            tournamentId={tournamentId}
            stageId={null}
            stageName="Default (All matches)"
            rule={rulesByStage.get('default')}
          />

          {/* Per-stage overrides */}
          {stages.map((stage) => (
            <StageFormatEditor
              key={stage.id}
              tournamentId={tournamentId}
              stageId={stage.id}
              stageName={`${stage.name} override`}
              rule={rulesByStage.get(stage.id)}
            />
          ))}
        </div>
      )}

      {!open && (
        <div className="flex flex-wrap gap-2">
          {/* Show current settings as read-only pills */}
          {[
            { id: null as string | null, name: 'Default' },
            ...stages.map((s) => ({ id: s.id, name: s.name })),
          ].map(({ id, name }) => {
            const rule = rulesByStage.get(id ?? 'default');
            const presetKey = rule ? detectPreset(rule) : 'BO3';
            const preset = PRESETS[presetKey as keyof typeof PRESETS];
            return (
              <span
                key={id ?? 'default'}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
              >
                <span className="text-text-secondary">{name}: </span>
                <span className="font-bold text-text-primary">{preset.label}</span>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
