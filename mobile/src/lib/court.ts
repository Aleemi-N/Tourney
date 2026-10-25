// Which team stands on the left of the scoreboard and who serves, for the active set.
// The database stores only explicit toss choices; later sets follow volleyball convention:
// sides and first serve alternate every set, the deciding set is a fresh toss, and in the
// deciding set the teams switch sides when one reaches half the target.

export type CourtSet = {
  set_number: number;
  status: string;
  home_score: number;
  away_score: number;
  target_points: number;
  left_team_id?: string | null;
  first_serve_team_id?: string | null;
  serving_team_id?: string | null;
};

export type Court = {
  leftId: string | null;
  rightId: string | null;
  /** The team serving right now, or null when unknown. */
  servingId: string | null;
  /** The toss has not been recorded for this set. */
  needsSetup: boolean;
  /** Deciding set, and the teams have just switched sides. */
  switchedSides: boolean;
};

const UNKNOWN: Court = { leftId: null, rightId: null, servingId: null, needsSetup: true, switchedSides: false };

export function isDecidingSet(set: CourtSet, sets: CourtSet[]) {
  return sets.length > 1 && set.set_number === sets.length;
}

export function deriveCourt(sets: CourtSet[], active: CourtSet | undefined, homeId: string, awayId: string): Court {
  if (!active) return UNKNOWN;
  const other = (id: string) => (id === homeId ? awayId : homeId);
  const ordered = [...sets].sort((a, b) => a.set_number - b.set_number);

  // Walk the sets in order so a derived set can follow the one before it.
  let left: string | null = null;
  let first: string | null = null;
  for (const set of ordered) {
    if (set.left_team_id && set.first_serve_team_id) {
      left = set.left_team_id;
      first = set.first_serve_team_id;
    } else if (left && first && !isDecidingSet(set, ordered)) {
      left = other(left);
      first = other(first);
    } else {
      left = null;
      first = null;
    }
    if (set.set_number === active.set_number) break;
  }
  if (!left || !first) return UNKNOWN;

  const switchedSides = isDecidingSet(active, ordered) && Math.max(active.home_score, active.away_score) >= Math.ceil(active.target_points / 2);
  const leftId = switchedSides ? other(left) : left;
  const pointsPlayed = active.home_score + active.away_score > 0;
  return {
    leftId,
    rightId: other(leftId),
    servingId: active.serving_team_id ?? (pointsPlayed ? null : first),
    needsSetup: false,
    switchedSides,
  };
}
