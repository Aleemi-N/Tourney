// Match ordering and day planning, the same rules as the website's FixtureManager and PlanDaysModal.

export type PlanMatch = {
  id: string; status: string; scheduled_at: string | null; venue: string | null; court: string | null;
  home_team_id: string | null; away_team_id: string | null; home_team: { name: string } | null; away_team: { name: string } | null;
};

export const LOCKED = ['LIVE', 'COMPLETED', 'CANCELLED'];

/** Reorders the unplayed matches so teams get the most rest between games. Locked matches stay first. */
export function interleaveMatchesForMaxRest<M extends PlanMatch>(matches: M[]): M[] {
  if (matches.length <= 2) return [...matches];
  const locked = matches.filter((m) => LOCKED.includes(m.status));
  const open = matches.filter((m) => !LOCKED.includes(m.status));
  if (open.length <= 2) return [...matches];

  const result: M[] = [...locked];
  const lastPlayed = new Map<string, number>();
  const homeKey = (m: M) => m.home_team_id || m.home_team?.name || `home_${m.id}`;
  const awayKey = (m: M) => m.away_team_id || m.away_team?.name || `away_${m.id}`;
  result.forEach((m, idx) => { lastPlayed.set(homeKey(m), idx); lastPlayed.set(awayKey(m), idx); });

  const remaining = [...open];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i];
      const homeRest = lastPlayed.has(homeKey(m)) ? result.length - lastPlayed.get(homeKey(m))! : 999;
      const awayRest = lastPlayed.has(awayKey(m)) ? result.length - lastPlayed.get(awayKey(m))! : 999;
      const score = Math.min(homeRest, awayRest) * 100000 + (homeRest + awayRest) * 100 - i;
      if (score > bestScore) { bestScore = score; bestIndex = i; }
    }
    const [chosen] = remaining.splice(bestIndex, 1);
    result.push(chosen);
    lastPlayed.set(homeKey(chosen), result.length - 1);
    lastPlayed.set(awayKey(chosen), result.length - 1);
  }
  return result;
}

export type Day = { date: string; start: string; count: number };

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function nextDate(date: string) {
  const d = new Date(`${date}T00:00`);
  d.setDate(d.getDate() + 1);
  return ymd(d);
}

export function split(total: number, days: number) {
  return Array.from({ length: days }, (_, i) => Math.floor(total / days) + (i < total % days ? 1 : 0));
}

export type PlanDefaults = { startDate: string | null; endDate: string | null; stageType: string; hasNextStage: boolean };

export function initialPlan(items: PlanMatch[], { startDate, endDate, stageType, hasNextStage }: PlanDefaults): { days: Day[]; minutes: number } {
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
  // Default to the tournament's dates; a league feeding a next stage leaves the last day for it.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  let span = startDate && endDate ? Math.round((new Date(`${endDate}T00:00`).getTime() - new Date(`${startDate}T00:00`).getTime()) / 86400000) + 1 : 0;
  let date = startDate ?? ymd(tomorrow);
  if (stageType === 'KNOCKOUT' && endDate) { date = endDate; span = 1; }
  else if (hasNextStage && span >= 2) span -= 1;
  const counts = split(items.length, span >= 1 && span <= 7 ? span : items.length > 8 ? 2 : 1);
  return { minutes: 45, days: counts.map((count, i) => { if (i) date = nextDate(date); return { date, start: '09:00', count }; }) };
}

export function timeAt(day: Day, index: number, minutes: number) {
  const at = new Date(`${day.date}T${day.start}`);
  at.setMinutes(at.getMinutes() + index * minutes);
  return at;
}

/**
 * Lays a day's matches out over several courts: matches in the same time slot never share a team, so nobody is asked to
 * play two matches at once, and each slot fills every court before the next slot starts.
 */
export function layoutDay<M extends PlanMatch>(matches: M[], courts: number): { match: M; slot: number; court: number }[] {
  const out: { match: M; slot: number; court: number }[] = [];
  const remaining = [...matches];
  let slot = 0;
  while (remaining.length > 0) {
    const busy = new Set<string>();
    let court = 0;
    for (let i = 0; i < remaining.length && court < courts; ) {
      const m = remaining[i];
      const home = m.home_team_id ?? `h-${m.id}`;
      const away = m.away_team_id ?? `a-${m.id}`;
      if (busy.has(home) || busy.has(away)) { i++; continue; }
      busy.add(home); busy.add(away);
      out.push({ match: m, slot, court: court++ });
      remaining.splice(i, 1);
    }
    slot++;
  }
  return out;
}
