'use client';

import { useState } from 'react';
import { createClient } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { cardClasses } from '@/components/ui/Card';
import { cn, teamColorStyle } from '@/lib/utils';

type Team = { id: string; name: string; color: string };

/** Coin-toss result for a set: which team is on the left of the scoreboard and who serves first. */
export function CourtSetup({
  matchId,
  setNumber,
  home,
  away,
  initialLeftId,
  initialServeId,
  onSaved,
  onCancel,
}: {
  matchId: string;
  setNumber: number;
  home: Team;
  away: Team;
  initialLeftId: string | null;
  initialServeId: string | null;
  onSaved: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [leftId, setLeftId] = useState(initialLeftId ?? home.id);
  const [serveId, setServeId] = useState(initialServeId ?? home.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { error: rpcError } = await createClient().rpc('set_match_setup', {
      p_match_id: matchId,
      p_set_number: setNumber,
      p_left_team_id: leftId,
      p_first_serve_team_id: serveId,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await onSaved();
  }

  const choice = (name: string, value: string, set: (id: string) => void, label: string) => (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-semibold text-text-secondary">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {[home, away].map((team) => (
          <label
            key={team.id}
            className={cn(
              'flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-primary',
              value === team.id ? 'border-transparent' : 'border-border bg-surface text-text-primary hover:bg-surface-muted',
            )}
            style={value === team.id ? teamColorStyle(team.color) : undefined}
          >
            <input type="radio" name={name} value={team.id} checked={value === team.id} onChange={() => set(team.id)} className="sr-only" />
            <span className="line-clamp-2">{team.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section className={`${cardClasses} space-y-4 p-4`} aria-label={`Set ${setNumber} sides and serve`}>
      <div>
        <h2 className="text-base font-semibold text-text-primary">Set {setNumber}: sides and serve</h2>
        <p className="text-sm text-text-secondary">Record the coin toss. Scoring works without it, but the board will not show sides or the server.</p>
      </div>
      {choice(`left-${setNumber}`, leftId, setLeftId, 'Team on the left')}
      {choice(`serve-${setNumber}`, serveId, setServeId, 'Serves first')}
      {error ? <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2.5 text-sm font-medium text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancel</Button> : null}
        <Button loading={saving} onClick={() => void save()}>Save</Button>
      </div>
    </section>
  );
}
