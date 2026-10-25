import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveCourt } from '../src/lib/court.ts';

const H = 'home', A = 'away';
const set = (n, extra = {}) => ({ set_number: n, status: 'PENDING', home_score: 0, away_score: 0, target_points: n === 5 ? 15 : 25, ...extra });

test('no toss recorded: the scorer must set up the match', () => {
  assert.equal(deriveCourt([set(1), set(2), set(3)], set(1), H, A).needsSetup, true);
});

test('stored toss: left side and first server, serve follows the latest point', () => {
  const s1 = set(1, { left_team_id: A, first_serve_team_id: H });
  const fresh = deriveCourt([s1, set(2), set(3)], s1, H, A);
  assert.deepEqual([fresh.leftId, fresh.rightId, fresh.servingId], [A, H, H]);
  const played = { ...s1, home_score: 3, away_score: 2, serving_team_id: A };
  assert.equal(deriveCourt([played, set(2), set(3)], played, H, A).servingId, A);
});

test('later sets swap sides and first serve; the deciding set needs a new toss', () => {
  const s1 = set(1, { left_team_id: H, first_serve_team_id: H, status: 'COMPLETED' });
  const s2 = set(2, { status: 'LIVE' });
  const two = deriveCourt([s1, s2, set(3)], s2, H, A);
  assert.deepEqual([two.leftId, two.servingId, two.needsSetup], [A, A, false]);
  const sets5 = [1, 2, 3, 4, 5].map((n) => set(n, n === 1 ? { left_team_id: H, first_serve_team_id: H } : {}));
  assert.equal(deriveCourt(sets5, sets5[4], H, A).needsSetup, true);
});

test('deciding set: sides switch when a team reaches half the target', () => {
  const toss = { left_team_id: H, first_serve_team_id: A };
  const early = set(3, { ...toss, home_score: 7, away_score: 4, serving_team_id: H });
  const late = set(3, { ...toss, home_score: 8, away_score: 4, serving_team_id: H });
  assert.deepEqual([deriveCourt([set(1), set(2), { ...early, target_points: 15 }], { ...early, target_points: 15 }, H, A).leftId], [H]);
  const after = deriveCourt([set(1), set(2), { ...late, target_points: 15 }], { ...late, target_points: 15 }, H, A);
  assert.deepEqual([after.leftId, after.switchedSides], [A, true]);
});
