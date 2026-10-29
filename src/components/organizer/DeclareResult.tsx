'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';

type Choice = 'WALKOVER_HOME' | 'WALKOVER_AWAY' | 'DRAW';

/**
 * Organizer decides a match without playing it: one team walks over (it wins without a
 * point being scored) or the match is drawn (league only). Replaces a result already recorded.
 */
export function DeclareResult({
  matchId,
  home,
  away,
  homeId,
  awayId,
  allowDraw,
  disabled,
  current,
}: {
  matchId: string;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  allowDraw: boolean;
  disabled: boolean;
  current: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>('WALKOVER_HOME');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  async function declare() {
    const label = choice === 'DRAW' ? 'a draw' : `a walkover for ${choice === 'WALKOVER_HOME' ? home : away}`;
    if (!window.confirm(`Record ${label}? This replaces any score already entered.`)) return;
    setSaving(true);
    setMessage(null);
    const { error } = await createClient().rpc('declare_match_result', {
      p_match_id: matchId,
      p_result_type: choice === 'DRAW' ? 'DRAW' : 'WALKOVER',
      p_winner_team_id: choice === 'DRAW' ? null : choice === 'WALKOVER_HOME' ? homeId : awayId,
      p_reason: reason,
    });
    setSaving(false);
    if (error) {
      setMessage({ tone: 'danger', text: error.message });
      return;
    }
    setReason('');
    setMessage({ tone: 'success', text: 'Result recorded.' });
    router.refresh();
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-text-secondary">
        Walkover or draw{current !== 'PLAYED' ? ` · currently ${current === 'DRAW' ? 'a draw' : 'a walkover'}` : ''}
      </p>
      <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
        <Select aria-label="Result" value={choice} disabled={disabled || saving} onChange={(e) => setChoice(e.target.value as Choice)}>
          <option value="WALKOVER_HOME">{home} wins (walkover)</option>
          <option value="WALKOVER_AWAY">{away} wins (walkover)</option>
          {allowDraw ? <option value="DRAW">Draw</option> : null}
        </Select>
        <Input aria-label="Reason" placeholder="Reason, e.g. team did not show up" autoComplete="off" disabled={disabled || saving} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="secondary" loading={saving} disabled={disabled || reason.trim() === ''} onClick={() => void declare()}>Record result</Button>
      </div>
      {message ? <p role="status" className={`mt-1.5 text-xs ${message.tone === 'success' ? 'text-success' : 'text-danger'}`}>{message.text}</p> : null}
    </div>
  );
}
