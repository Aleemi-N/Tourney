// Lineups, substitutions and rotation. The database stores the starting order, the substitutions and how often each side
// has won the serve back; the court positions follow from those. Positions are numbered I to VI, I being the server.

export type LinePlayer = { id: string; name: string; number: string | null };
export type Lineup = { set_number: number; team_id: string; libero_id: string | null; slots: LinePlayer[]; libero: LinePlayer | null };
export type Substitution = { set_number: number; team_id: string; kind: 'SUB' | 'LIBERO_IN' | 'LIBERO_OUT'; out_id: string; out_name: string; in_id: string; in_name: string; home_score: number; away_score: number };
export type LineupData = { lineups: Lineup[]; substitutions: Substitution[]; rotations: { set_number: number; team_id: string; count: number }[]; mvp: { id: string; name: string } | null };

export type Squad = { team_id: string; players: { id: string; name: string; number: string | null; position: string | null }[] };

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
/** Positions on the court: front row IV, III, II and back row V, VI, I (index 0 = position I). */
export const FRONT_ROW = [3, 2, 1];
export const BACK_ROW = [4, 5, 0];
export const isBackRow = (index: number) => BACK_ROW.includes(index);

export type Court = { positions: LinePlayer[]; liberoOnCourt: boolean; subsUsed: number; libero: LinePlayer | null; rotations: number };

/** Who stands where right now for a team in a set, or null when no lineup was recorded. */
export function courtFor(data: LineupData | null, setNumber: number, teamId: string): Court | null {
  const lineup = data?.lineups.find((l) => l.set_number === setNumber && l.team_id === teamId);
  if (!data || !lineup) return null;
  // A substitution replaces the player in their starting slot; rotation then only moves the slots around the court.
  const slots = lineup.slots.map((p) => ({ ...p }));
  let subsUsed = 0;
  for (const s of data.substitutions.filter((x) => x.set_number === setNumber && x.team_id === teamId)) {
    const at = slots.findIndex((p) => p.id === s.out_id);
    if (at >= 0) slots[at] = { id: s.in_id, name: s.in_name, number: lineup.libero?.id === s.in_id ? lineup.libero.number : null };
    if (s.kind === 'SUB') subsUsed++;
  }
  const k = data.rotations.find((r) => r.set_number === setNumber && r.team_id === teamId)?.count ?? 0;
  const positions = slots.map((_, i) => slots[(i + k) % 6]);
  return { positions, liberoOnCourt: !!lineup.libero && slots.some((p) => p.id === lineup.libero!.id), subsUsed, libero: lineup.libero, rotations: k };
}

export const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
};
