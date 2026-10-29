'use client';

import { useState } from 'react';
import { PencilLine, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

type FixSet = { set_number: number; status: string; home_score: number; away_score: number };

/**
 * Manual fixes for a wrong score: correct the latest set's score, or reset the whole match.
 * Both need a reason and are audited; a completed match can only be changed by an organizer
 * (the database refuses anyone else and the message is shown).
 */
export function ScoreFixPanel({
  matchId,
  sets,
  homeName,
  awayName,
  disabled,
  onChanged,
}: {
  matchId: string;
  sets: FixSet[];
  homeName: string;
  awayName: string;
  disabled: boolean;
  onChanged: () => Promise<void>;
}) {
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
    const api = createClient();
    const { error: rpcError } = mode === 'reset'
      ? await api.rpc('reset_match', { p_match_id: matchId, p_reason: reason })
      : await api.rpc('correct_set_score', { p_match_id: matchId, p_set_number: latest!.set_number, p_home_score: Number(home), p_away_score: Number(away), p_reason: reason });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMode(null);
    await onChanged();
  }

  const valid = reason.trim() !== '' && (mode === 'reset' || (home !== '' && away !== '' && Number(home) >= 0 && Number(away) >= 0));

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" disabled={disabled || !latest} onClick={() => open('correct')}>
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          Correct score
        </Button>
        <Button variant="danger-outline" size="sm" disabled={disabled || !latest} onClick={() => open('reset')}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Reset match
        </Button>
      </div>

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        dismissible={!saving}
        title={mode === 'reset' ? 'Reset this match?' : `Correct set ${latest?.set_number ?? ''} score`}
        icon={mode === 'reset' ? <RotateCcw className="h-5 w-5" /> : <PencilLine className="h-5 w-5" />}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setMode(null)}>Cancel</Button>
            <Button variant={mode === 'reset' ? 'danger' : 'primary'} loading={saving} disabled={!valid} onClick={() => void submit()}>
              {mode === 'reset' ? 'Reset match' : 'Save correction'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {mode === 'reset' ? (
            <p className="text-sm text-text-secondary">
              Every set goes back to 0 – 0 and the match returns to Scheduled. Any result it already produced (standings, bracket places) is taken back.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={homeName} htmlFor="fix-home">
                <Input id="fix-home" type="number" min={0} inputMode="numeric" value={home} onChange={(e) => setHome(e.target.value)} />
              </Field>
              <Field label={awayName} htmlFor="fix-away">
                <Input id="fix-away" type="number" min={0} inputMode="numeric" value={away} onChange={(e) => setAway(e.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Reason" htmlFor="fix-reason" hint="Kept in the audit log.">
            <Input id="fix-reason" autoComplete="off" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
