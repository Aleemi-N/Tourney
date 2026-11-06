// The jersey order sheet: for every team its players' number, name on the jersey and size (with a note where something is missing
// or two players share a number), then how many of each size to order.
// The website and the mobile app share this file: `node scripts/sync-client.mjs` copies it to mobile/src/lib/jersey-sheet.ts, so edit only this one.

export type JerseyCell = string | number | null;
export type JerseyRow = {
  team: string | null;
  player: string | null;
  jerseyName: string | null;
  jerseyNumber: string | number | null;
  jerseySize: string | null;
};

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const NO_SIZE = 'Not given';

const clean = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value).trim());
const numberOf = (value: string | number | null) => (/^\d+$/.test(clean(value)) ? Number(clean(value)) : Number.POSITIVE_INFINITY);
const sizeOf = (row: JerseyRow) => clean(row.jerseySize).toUpperCase() || NO_SIZE;
const sizeRank = (size: string) => (size === NO_SIZE ? 99 : SIZES.includes(size) ? SIZES.indexOf(size) : 50);

/** Rows ready for a CSV file: the list per team, the sizes to order per team, and the totals. */
export function jerseySheet(rows: JerseyRow[]): JerseyCell[][] {
  const sorted = [...rows].sort((a, b) => clean(a.team).localeCompare(clean(b.team)) || numberOf(a.jerseyNumber) - numberOf(b.jerseyNumber) || clean(a.player).localeCompare(clean(b.player)));
  const sameNumber = (r: JerseyRow) => clean(r.jerseyNumber) !== '' && sorted.some((o) => o !== r && clean(o.team) === clean(r.team) && clean(o.jerseyNumber) === clean(r.jerseyNumber));
  const check = (r: JerseyRow) => [clean(r.jerseyNumber) === '' && 'No number', clean(r.jerseySize) === '' && 'No size', sameNumber(r) && 'Number used twice'].filter(Boolean).join('; ');
  const out: JerseyCell[][] = [['Team', 'Number', 'Name on jersey', 'Player', 'Size', 'Check'], ...sorted.map((r) => [clean(r.team), clean(r.jerseyNumber), clean(r.jerseyName), clean(r.player), clean(r.jerseySize).toUpperCase(), check(r)])];

  const sizes = [...new Set(rows.map(sizeOf))].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
  const teams = [...new Set(sorted.map((r) => clean(r.team)))];
  const count = (team: string | null, size: string) => rows.filter((r) => (team === null || clean(r.team) === team) && sizeOf(r) === size).length;
  out.push([], ['Sizes to order', ...sizes, 'Total']);
  for (const team of teams) out.push([team, ...sizes.map((s) => count(team, s)), rows.filter((r) => clean(r.team) === team).length]);
  out.push(['All teams', ...sizes.map((s) => count(null, s)), rows.length]);
  return out;
}
