'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type PlanMatch = {
  id: string; status: string; scheduled_at: string | null; venue: string | null; court: string | null;
  home_team: { name: string } | null; away_team: { name: string } | null;
};
type Day = { date: string; start: string; count: number };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const LOCKED = ['LIVE', 'COMPLETED', 'CANCELLED'];

function nextDate(date: string) {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

function split(total: number, days: number) {
  return Array.from({ length: days }, (_, i) => Math.floor(total / days) + (i < total % days ? 1 : 0));
}

type Defaults = { startDate: string | null; endDate: string | null; stageType: string; hasNextStage: boolean };

function initialPlan(items: PlanMatch[], { startDate, endDate, stageType, hasNextStage }: Defaults): { days: Day[]; minutes: number } {
  if (items.length && items.every((m) => m.scheduled_at)) {
    const days: Day[] = [];
    let minutes = 45;
    items.forEach((m, i) => {
      const at = new Date(m.scheduled_at!);
      const last = days[days.length - 1];
      if (last?.date === ymd(at)) {
        if (last.count === 1) minutes = Math.max(5, Math.round((at.getTime() - new Date(items[i - 1].scheduled_at!).getTime()) / 60000));
        last.count++;
      } else days.push({ date: ymd(at), start: hm(at), count: 1 });
    });
    return { days, minutes };
  }
  // Default to the tournament's dates: a league feeding a next stage leaves the last day for it
  // (9–11 Oct → league on 9 & 10, knockout on 11).
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  let span = startDate && endDate ? Math.round((new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) / 86400000) + 1 : 0;
  let date = startDate ?? ymd(tomorrow);
  if (stageType === 'KNOCKOUT' && endDate) { date = endDate; span = 1; }
  else if (hasNextStage && span >= 2) span -= 1;
  const counts = split(items.length, span >= 1 && span <= 7 ? span : items.length > 8 ? 2 : 1);
  return {
    minutes: 45,
    days: counts.map((count, i) => {
      if (i) date = nextDate(date);
      return { date, start: '09:00', count };
    }),
  };
}

function timeAt(day: Day, index: number, minutes: number) {
  const at = new Date(`${day.date}T${day.start}`);
  at.setMinutes(at.getMinutes() + index * minutes);
  return at;
}

export function PlanDaysModal({ stageName, items, onClose, onSaved, ...defaults }: Defaults & {
  stageName: string; items: PlanMatch[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [plan, setPlan] = useState(() => initialPlan(items, defaults));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const assigned = plan.days.reduce((sum, d) => sum + d.count, 0);
  const valid = assigned === items.length && plan.days.every((d) => d.date && d.start && d.count >= 0) && plan.minutes > 0;

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

  function updateDay(i: number, patch: Partial<Day>) {
    setPlan((p) => ({ ...p, days: p.days.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) }));
  }

  // Matches in program order, each paired with its day and slot index.
  const slots: Array<{ match: PlanMatch; day: number; at: Date }> = [];
  let k = 0;
  plan.days.forEach((day, d) => {
    for (let i = 0; i < day.count && k < items.length; i++) slots.push({ match: items[k++], day: d, at: timeAt(day, i, plan.minutes) });
  });

  async function save() {
    setError('');
    const supabase = createClient();
    const todo = slots.filter((s) => !LOCKED.includes(s.match.status));
    for (const [i, s] of todo.entries()) {
      setSaving(`Saving ${i + 1} of ${todo.length}…`);
      const { error: rpcError } = await supabase.rpc('update_match_schedule', {
        p_match_id: s.match.id,
        p_scheduled_at: s.at.toISOString(),
        p_venue: s.match.venue ?? undefined,
        p_court: s.match.court ?? undefined,
      });
      if (rpcError) {
        setSaving(null);
        setError(`Stopped at ${s.match.home_team?.name ?? 'TBD'} vs ${s.match.away_team?.name ?? 'TBD'}: ${rpcError.message}`);
        return;
      }
    }
    setSaving(null);
    onSaved(`Scheduled ${todo.length} matches across ${plan.days.length} day${plan.days.length > 1 ? 's' : ''}.`);
  }

  const input = 'min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5">
          <div>
            <h3 className="text-lg font-black text-text-primary">📅 Plan Match Days</h3>
            <p className="text-xs text-text-secondary">{stageName} · {items.length} matches in the saved order</p>
          </div>
          <button onClick={onClose} disabled={!!saving} className="rounded-lg p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary">✕</button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
              Number of days
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDayCount(plan.days.length - 1)} className="h-10 w-10 shrink-0 rounded-lg border border-border font-black text-text-primary">−</button>
                <span className="flex-1 text-center text-xl font-black text-text-primary">{plan.days.length}</span>
                <button type="button" onClick={() => setDayCount(plan.days.length + 1)} className="h-10 w-10 shrink-0 rounded-lg border border-border font-black text-text-primary">+</button>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">
              Minutes per match
              <input type="number" min={5} step={5} value={plan.minutes} onChange={(e) => setPlan((p) => ({ ...p, minutes: Number(e.target.value) }))} className={input} />
            </label>
          </div>

          <div className="space-y-3">
            {plan.days.map((day, i) => {
              const daySlots = slots.filter((s) => s.day === i);
              const first = daySlots[0], last = daySlots[daySlots.length - 1];
              return (
                <div key={i} className="rounded-xl border border-border bg-background p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-black uppercase tracking-widest text-primary">Day {i + 1}</p>
                    <p className="text-xs text-text-muted">
                      {first ? `M${slots.indexOf(first) + 1}–M${slots.indexOf(last) + 1} · ${hm(first.at)} → ${hm(new Date(last.at.getTime() + plan.minutes * 60000))}` : 'No matches'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">Date
                      <input type="date" value={day.date} onChange={(e) => updateDay(i, { date: e.target.value })} className={input} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">Start
                      <input type="time" value={day.start} onChange={(e) => updateDay(i, { start: e.target.value })} className={input} />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-semibold text-text-secondary">Matches
                      <input type="number" min={0} max={items.length} value={day.count} onChange={(e) => updateDay(i, { count: Math.max(0, Number(e.target.value)) })} className={input} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-border">
            <p className="border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-muted">Preview</p>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto text-sm">
              {slots.map((s, i) => (
                <li key={s.match.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-20 shrink-0 whitespace-nowrap text-xs font-black text-primary">D{s.day + 1} · {hm(s.at)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">M{i + 1} · {s.match.home_team?.name ?? 'TBD'} <span className="text-xs font-normal text-text-muted">vs</span> {s.match.away_team?.name ?? 'TBD'}</span>
                  {LOCKED.includes(s.match.status) && <span className="text-xs font-bold text-text-muted">{s.match.status}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <p className={`text-xs font-semibold ${error || assigned !== items.length ? 'text-danger' : saving ? 'text-text-secondary' : 'text-success'}`}>
            {error || saving || (assigned === items.length ? `All ${items.length} matches assigned` : `${assigned} of ${items.length} assigned — adjust the match counts`)}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={!!saving} className="min-h-10 rounded-lg border border-border px-4 text-sm font-semibold">Cancel</button>
            <button onClick={() => void save()} disabled={!valid || !!saving} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">Save Schedule</button>
          </div>
        </div>
      </div>
    </div>
  );
}
