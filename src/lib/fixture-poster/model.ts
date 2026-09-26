export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1350;

export const POSTER_TEMPLATES = [
  { id: 'arena-dark', name: 'Arena Dark', description: 'Dramatic arena lighting and a centered VS stage.' },
  { id: 'bold-matchday', name: 'Bold Matchday', description: 'High-energy angles, oversized type, and split matchups.' },
  { id: 'clean-minimal', name: 'Clean Minimal', description: 'Editorial spacing and maximum schedule clarity.' },
  { id: 'brand-fusion', name: 'Brand Fusion', description: 'A bold composition driven by tournament branding.' },
  { id: 'night-volley', name: 'Night Volley', description: 'Floodlights, court lines, and a night-match atmosphere.' },
] as const;

export type PosterTemplateId = (typeof POSTER_TEMPLATES)[number]['id'];

export type PosterTournament = {
  id: string;
  name: string;
  slug: string;
  venue: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

export type PosterFixtureInput = {
  id: string;
  program_order: number;
  round_number: number | null;
  scheduled_at: string | null;
  venue: string | null;
  court: string | null;
  home_team: { name: string } | null;
  away_team: { name: string } | null;
};

export type PosterFixture = Readonly<{
  id: string;
  programOrder: number;
  roundNumber: number | null;
  scheduledAt: string | null;
  venue: string | null;
  court: string | null;
  homeTeam: string;
  awayTeam: string;
}>;

export type PosterGroup = Readonly<{
  key: string;
  roundLabel: string | null;
  dateLabel: string;
  fixtures: readonly PosterFixture[];
}>;

export type PosterModel = Readonly<{
  tournament: Readonly<PosterTournament>;
  fixtures: readonly PosterFixture[];
  groups: readonly PosterGroup[];
  commonVenue: string | null;
  fingerprint: string;
}>;

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value)).toUpperCase()
  : 'DATE TO BE CONFIRMED';

export function formatFixtureTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(value))
    : 'TIME TBC';
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildPosterModel(tournament: PosterTournament, input: readonly PosterFixtureInput[]): PosterModel {
  const fixtures = [...input]
    .sort((a, b) => a.program_order - b.program_order)
    .map((fixture) => Object.freeze({
      id: fixture.id,
      programOrder: fixture.program_order,
      roundNumber: fixture.round_number,
      scheduledAt: fixture.scheduled_at,
      venue: fixture.venue,
      court: fixture.court,
      homeTeam: fixture.home_team?.name ?? 'TBD',
      awayTeam: fixture.away_team?.name ?? 'TBD',
    }));

  const grouped = new Map<string, { roundLabel: string | null; dateLabel: string; fixtures: PosterFixture[] }>();
  for (const fixture of fixtures) {
    const roundLabel = fixture.roundNumber === null ? null : `ROUND ${fixture.roundNumber}`;
    const dateLabel = formatDate(fixture.scheduledAt);
    const key = `${fixture.roundNumber ?? 'none'}|${dateLabel}`;
    const current = grouped.get(key) ?? { roundLabel, dateLabel, fixtures: [] };
    current.fixtures.push(fixture);
    grouped.set(key, current);
  }

  const venues = new Set(fixtures.map((fixture) => fixture.venue ?? tournament.venue).filter((venue): venue is string => Boolean(venue)));
  const frozenTournament = Object.freeze({ ...tournament });
  const groups = [...grouped].map(([key, group]) => Object.freeze({ ...group, key, fixtures: Object.freeze(group.fixtures) }));
  const fingerprint = JSON.stringify(fixtures.map((fixture) => [fixture.id, fixture.programOrder, fixture.roundNumber, fixture.scheduledAt, fixture.venue, fixture.court, fixture.homeTeam, fixture.awayTeam]));
  return Object.freeze({ tournament: frozenTournament, fixtures: Object.freeze(fixtures), groups: Object.freeze(groups), commonVenue: venues.size === 1 ? [...venues][0] : null, fingerprint });
}

export function variantSeed(model: PosterModel, template: PosterTemplateId, variant: number) {
  return stableHash(`${model.tournament.id}|${template}|${variant}|${model.fingerprint}`);
}

export function fixturePageCount(fixtureCount: number) {
  return Math.max(1, Math.ceil(fixtureCount / 12));
}
