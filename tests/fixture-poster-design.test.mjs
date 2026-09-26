import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPosterModel, fixturePageCount, POSTER_HEIGHT, POSTER_TEMPLATES, POSTER_WIDTH, variantSeed } from '../src/lib/fixture-poster/model.ts';

const tournament = { id: '9944f7b3-54cc-40ec-939c-067d383b4019', name: 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8', slug: 'pudolz-season-8', venue: 'Pudolz Arena', logoUrl: null, primaryColor: null, secondaryColor: null };
const teams = ['TEAM SMASHERS', 'Chotta mumbai', 'TM BEDAKANZ', 'ABAN volly'];
const pairs = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];
const fixtures = pairs.map(([home, away], index) => ({ id: `fixture-${index + 1}`, program_order: index + 1, round_number: Math.floor(index / 2) + 1, scheduled_at: `2026-09-${String(26 + Math.floor(index / 2)).padStart(2, '0')}T13:30:00.000Z`, venue: 'Pudolz Arena', court: `Court ${(index % 2) + 1}`, home_team: { name: teams[home] }, away_team: { name: teams[away] } }));

test('all five templates consume one immutable authoritative fixture model', () => {
  const reversed = [...fixtures].reverse(); const model = buildPosterModel(tournament, reversed);
  assert.equal(POSTER_TEMPLATES.length, 5); assert.deepEqual(model.fixtures.map((fixture) => fixture.id), fixtures.map((fixture) => fixture.id));
  for (const template of POSTER_TEMPLATES) { assert.equal(model.fingerprint, buildPosterModel(tournament, reversed).fingerprint, template.name); assert.deepEqual(reversed.map((fixture) => fixture.id), [...fixtures].reverse().map((fixture) => fixture.id), `${template.name} must not mutate its input`); }
});

test('PUDOLZ six-fixture data, long titles, and long team names remain complete', () => {
  const longName = 'A VERY LONG VOLLEYBALL CLUB NAME THAT MUST NEVER BE CROPPED FROM AUTHORITATIVE DATA';
  const model = buildPosterModel({ ...tournament, name: `${tournament.name} INTERNATIONAL CHAMPIONSHIP` }, [{ ...fixtures[0], home_team: { name: longName } }, ...fixtures.slice(1)]);
  assert.equal(model.fixtures.length, 6); assert.equal(model.tournament.name, 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8 INTERNATIONAL CHAMPIONSHIP'); assert.equal(model.fixtures[0].homeTeam, longName);
});

test('missing logo and brand colors use a valid model without altering data', () => { const model = buildPosterModel(tournament, fixtures.slice(0, 2)); assert.equal(model.tournament.logoUrl, null); assert.equal(model.tournament.primaryColor, null); assert.equal(model.fixtures.length, 2); });
test('2, 6, and 10+ fixture sets fit defined poster pages without loss', () => { assert.equal(fixturePageCount(2), 1); assert.equal(fixturePageCount(6), 1); assert.equal(fixturePageCount(12), 1); assert.equal(fixturePageCount(13), 2); });
test('authoritative dates and rounds form stable visual groups', () => { const model = buildPosterModel(tournament, fixtures); assert.equal(model.groups.length, 3); assert.deepEqual(model.groups.map((group) => group.roundLabel), ['ROUND 1', 'ROUND 2', 'ROUND 3']); assert.equal(model.groups[0].fixtures.length, 2); const multiDate = buildPosterModel(tournament, [{ ...fixtures[0], round_number: 1 }, { ...fixtures[1], round_number: 1, scheduled_at: '2026-09-27T13:30:00.000Z' }]); assert.equal(multiDate.groups.length, 2); });
test('controlled variants are deterministic and template-specific', () => { const model = buildPosterModel(tournament, fixtures); const first = variantSeed(model, 'arena-dark', 2); assert.equal(first, variantSeed(model, 'arena-dark', 2)); assert.notEqual(first, variantSeed(model, 'arena-dark', 3)); assert.notEqual(first, variantSeed(model, 'clean-minimal', 2)); });
test('native PNG canvas assumptions are Instagram portrait dimensions', () => { assert.equal(POSTER_WIDTH, 1080); assert.equal(POSTER_HEIGHT, 1350); assert.equal(POSTER_WIDTH / POSTER_HEIGHT, 4 / 5); });
