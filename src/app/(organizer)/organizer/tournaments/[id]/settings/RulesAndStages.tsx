'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Layers, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { StatusPill } from '@/components/ui/StatusPill';
import type { Stage, VolleyballRule } from './SettingsForm';

type SetRule = { set_number: number; target_points: number };

/** Result of preview_tournament_stage_removal: what the database will delete and what it keeps. */
type RemovalPlan = {
  stage_id: string;
  stage_name: string;
  allowed: boolean;
  requires_strong_confirmation: boolean;
  confirmation_phrase: string;
  snapshot: string;
  blockers: { code: string; message: string }[];
  remove: Record<string, number>;
  preserve: string[];
};
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
  return (
    <>
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
      <StageList tournamentId={tournamentId} stages={stages} />
    </>
  );
}

/**
 * Stages are created and edited under Fixtures; this list only removes them. The database
 * previews exactly what a removal deletes, and the organizer must type its confirmation phrase.
 */
function StageList({ tournamentId, stages }: { tournamentId: string; stages: Stage[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [removal, setRemoval] = useState<RemovalPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const ordered = [...stages].sort((a, b) => a.sequence - b.sequence);

  async function previewRemoval(stageId: string) {
    setMessage(null);
    setCheckingId(stageId);
    const { data, error } = await supabase.rpc('preview_tournament_stage_removal', { p_stage_id: stageId });
    setCheckingId(null);
    if (error) {
      setMessage({ tone: 'danger', text: error.message });
      return;
    }
    setConfirmation('');
    setRemoval(data as unknown as RemovalPlan);
  }

  async function removeStage() {
    if (!removal) return;
    setRemoving(true);
    const { error } = await supabase.rpc('remove_tournament_stage', {
      p_stage_id: removal.stage_id,
      p_expected_snapshot: removal.snapshot,
      p_confirmation: confirmation,
    });
    setRemoving(false);
    setRemoval(null);
    if (error) {
      // The snapshot guard rejects the removal if the stage changed since the preview.
      setMessage({ tone: 'danger', text: error.message });
      return;
    }
    setMessage({ tone: 'success', text: `${removal.stage_name} removed. Fixtures and standings are up to date.` });
    router.refresh();
    router.prefetch(`/organizer/tournaments/${tournamentId}/fixtures`);
    router.prefetch(`/organizer/tournaments/${tournamentId}/standings`);
  }

  return (
    <section className={`${cardClasses} p-5 sm:p-6`} aria-labelledby="stages-heading">
      <h2 id="stages-heading" className="text-lg font-semibold text-text-primary">Stages</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Create stages and set their rules on the{' '}
        <Link href={`/organizer/tournaments/${tournamentId}/fixtures`} className="text-primary underline underline-offset-2 hover:opacity-80">Fixtures page</Link>.
        Removing a stage here also removes its fixtures and standings.
      </p>

      {ordered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-secondary">No stages yet.</p>
      ) : (
        <ul role="list" className="mt-4 divide-y divide-border rounded-xl border border-border">
          {ordered.map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Layers className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-text-primary">{stage.name}</p>
                <p className="text-sm text-text-secondary">
                  Stage {stage.sequence} · {stage.stage_type === 'KNOCKOUT' ? 'Knockout' : 'League'}
                </p>
              </div>
              <StatusPill status={stage.status} />
              <Button
                variant="danger-outline"
                size="sm"
                loading={checkingId === stage.id}
                disabled={checkingId !== null}
                onClick={() => void previewRemoval(stage.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {message ? (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${message.tone === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {message.text}
        </p>
      ) : null}

      <Modal
        open={removal !== null}
        onClose={() => setRemoval(null)}
        dismissible={!removing}
        title={removal ? `Remove ${removal.stage_name}?` : 'Remove stage'}
        icon={<Trash2 className="h-5 w-5" />}
        footer={
          <>
            <Button variant="secondary" disabled={removing} onClick={() => setRemoval(null)}>Cancel</Button>
            {removal?.allowed ? (
              <Button
                variant="danger"
                loading={removing}
                disabled={confirmation !== removal.confirmation_phrase}
                onClick={() => void removeStage()}
              >
                Remove stage permanently
              </Button>
            ) : null}
          </>
        }
      >
        {removal?.allowed ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-text-secondary">This permanently removes:</p>
              <ul role="list" className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                {Object.entries(removal.remove).filter(([, count]) => count > 0).map(([label, count]) => (
                  <li key={label} className="rounded-lg bg-surface-muted px-3 py-2 text-text-primary">
                    <span className="font-semibold tabular-nums">{count}</span> {label.replaceAll('_', ' ')}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">Kept:</span> {removal.preserve.join(', ')}.
            </p>
            {removal.requires_strong_confirmation ? (
              <p className="flex gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-sm font-medium text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                This stage has fixtures. Their sets, scorer assignments and ordering data are removed too.
              </p>
            ) : null}
            <Field
              label={<>Type <span className="font-mono text-danger">{removal.confirmation_phrase}</span> to confirm</>}
              htmlFor="remove-stage-confirmation"
            >
              <Input
                id="remove-stage-confirmation"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="font-mono"
              />
            </Field>
          </div>
        ) : removal ? (
          <div className="rounded-xl bg-danger/10 p-4">
            <p className="font-semibold text-danger">This stage can&apos;t be removed.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
              {removal.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}
            </ul>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
