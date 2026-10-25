// v2 feature checks against the local synthetic seed. Every test runs in its own
// transaction and rolls back, so the seed is left untouched.
// Run: node --test supabase/tests/v2-features.test.mjs (after `supabase db reset --local`)
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const ORGANIZER = '90000000-0000-0000-0000-000000000001';
const T1 = '90200000-0000-0000-0000-000000000001';

async function inTransaction(fn) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query('BEGIN');
  try {
    const db = {
      one: async (sql, params) => (await client.query(sql, params)).rows[0],
      // Runs one statement as an authenticated app user, the way PostgREST does.
      as: async (userId, sql, params) => {
        await client.query("SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, true), set_config('request.jwt.claim.sub', $1::text, true)", [userId]);
        await client.query('SAVEPOINT as_user');
        await client.query('SET LOCAL ROLE authenticated');
        try {
          const row = (await client.query(sql, params)).rows[0];
          await client.query('RELEASE SAVEPOINT as_user');
          return row;
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT as_user');
          throw error;
        } finally {
          await client.query('RESET ROLE');
        }
      },
    };
    await fn(db);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

test('team colours chosen on the application carry over to the approved team', () => inTransaction(async (db) => {
  const applicant = '90000000-0000-0000-0000-000000000141';
  const { id: appId } = await db.as(applicant,
    "SELECT public.submit_team_owner_application($1, 'Colour Test VC', 'CTV', 'logos/x.png', NULL, NULL, NULL, '#AA0011', '#ffffff') AS id", [T1]);
  await assert.rejects(
    db.as(applicant, "SELECT public.submit_team_owner_application($1, 'Second', NULL, 'logos/x.png', NULL, NULL, NULL, 'red') AS id", [T1]),
    /Application already exists|check constraint/,
  );
  await db.as(ORGANIZER, 'SELECT public.approve_team_owner_application($1)', [appId]);
  const team = await db.one("SELECT id, primary_color, secondary_color FROM public.teams WHERE tournament_id=$1 AND name='Colour Test VC'", [T1]);
  assert.deepEqual([team.primary_color, team.secondary_color], ['#aa0011', '#ffffff']);

  await assert.rejects(db.as(applicant, "SELECT public.set_team_colors($1, '#000000')", [team.id]), /Unauthorized/);
  await assert.rejects(db.as(ORGANIZER, "SELECT public.set_team_colors($1, 'blue')", [team.id]), /check constraint/);
  await db.as(ORGANIZER, "SELECT public.set_team_colors($1, '#123456', NULL)", [team.id]);
  const changed = await db.one('SELECT primary_color, secondary_color FROM public.teams WHERE id=$1', [team.id]);
  assert.deepEqual([changed.primary_color, changed.secondary_color], ['#123456', null]);
  assert.ok(await db.one("SELECT 1 FROM public.audit_logs WHERE action='TEAM_COLORS_CHANGED' AND entity_id=$1", [team.id]));
}));

const STAGE3 = '90500000-0000-0000-0000-000000000003';
const T3 = '90200000-0000-0000-0000-000000000003';
const setsOf = async (db, matchId) => (await db.one(
  "SELECT string_agg(target_points::text, ',' ORDER BY set_number) AS t FROM public.match_sets WHERE match_id=$1", [matchId])).t;

test('per-match format: override, play to the shorter finish, and follow the stage again', () => inTransaction(async (db) => {
  const match = await db.one("SELECT id, home_team_id FROM public.matches WHERE stage_id=$1 AND status='SCHEDULED' AND home_team_id IS NOT NULL ORDER BY program_order LIMIT 1", [STAGE3]);
  assert.equal(await setsOf(db, match.id), '25,25,25,25,15');
  await assert.rejects(db.as('90000000-0000-0000-0000-000000000004', 'SELECT public.set_match_format($1, 2)', [match.id]), /Unauthorized/);

  await db.as(ORGANIZER, 'SELECT public.set_match_format($1, 2)', [match.id]);
  assert.equal(await setsOf(db, match.id), '25,25,15');
  await db.as(ORGANIZER, 'SELECT public.set_match_format($1, NULL)', [match.id]);
  assert.equal(await setsOf(db, match.id), '25,25,25,25,15');

  await db.as(ORGANIZER, 'SELECT public.set_match_format($1, 1)', [match.id]);
  for (let i = 0; i < 25; i++) await db.as(ORGANIZER, 'SELECT public.award_point($1, $2, $3)', [match.id, match.home_team_id, `bo1-${i}`]);
  const done = await db.one('SELECT status, winner_team_id FROM public.matches WHERE id=$1', [match.id]);
  assert.deepEqual([done.status, done.winner_team_id], ['COMPLETED', match.home_team_id]);
  await assert.rejects(db.as(ORGANIZER, 'SELECT public.set_match_format($1, 3)', [match.id]), /finished match/);
}));

test('a live match only accepts a format that decides nothing by itself', () => inTransaction(async (db) => {
  // Seeded live match: sets 1-1, set 3 at 18-16 in a best of 5.
  const live = await db.one("SELECT id FROM public.matches WHERE stage_id=$1 AND status='LIVE'", [STAGE3]);
  await assert.rejects(db.as(ORGANIZER, 'SELECT public.set_match_format($1, 1)', [live.id]), /would end this match/);
  await assert.rejects(db.as(ORGANIZER, 'SELECT public.set_match_format($1, 2)', [live.id]), /Set 3 is already at 18 points/);
  await db.as(ORGANIZER, 'SELECT public.set_match_format($1, 4)', [live.id]);
  assert.equal(await setsOf(db, live.id), '25,25,25,25,25,25,15');
  const set3 = await db.one('SELECT home_score, away_score, status FROM public.match_sets WHERE match_id=$1 AND set_number=3', [live.id]);
  assert.deepEqual(set3, { home_score: 18, away_score: 16, status: 'LIVE' });
}));

test('a stage rule change re-syncs only matches that have not started', () => inTransaction(async (db) => {
  const live = await db.one("SELECT id FROM public.matches WHERE stage_id=$1 AND status='LIVE'", [STAGE3]);
  const done = await db.one("SELECT id FROM public.matches WHERE stage_id=$1 AND status='COMPLETED' LIMIT 1", [STAGE3]);
  const doneBefore = await setsOf(db, done.id);
  await db.as(ORGANIZER, `SELECT public.save_volleyball_rule($1, $2, 2, true, '[{"set_number":1,"target_points":21},{"set_number":2,"target_points":21},{"set_number":3,"target_points":15}]'::jsonb)`, [T3, STAGE3]);
  const pending = await db.one(
    "SELECT count(*) FILTER (WHERE m.sets_to_win = 2) AS bo3, count(*) AS total FROM public.matches m WHERE m.stage_id=$1 AND m.status='SCHEDULED'", [STAGE3]);
  assert.equal(pending.bo3, pending.total);
  const scheduled = await db.one("SELECT id FROM public.matches WHERE stage_id=$1 AND status='SCHEDULED' LIMIT 1", [STAGE3]);
  assert.equal(await setsOf(db, scheduled.id), '21,21,15');
  assert.equal(await setsOf(db, live.id), '25,25,25,25,15');
  assert.equal((await db.one('SELECT sets_to_win FROM public.matches WHERE id=$1', [live.id])).sets_to_win, 3);
  assert.equal(await setsOf(db, done.id), doneBefore);
}));

test('score correction: live set, completed match, undo guard, and reset', () => inTransaction(async (db) => {
  const live = await db.one("SELECT id, home_team_id FROM public.matches WHERE stage_id=$1 AND status='LIVE'", [STAGE3]);
  const scorer = (await db.one('SELECT user_id FROM public.match_scorers WHERE match_id=$1 LIMIT 1', [live.id]))?.user_id ?? ORGANIZER;
  await assert.rejects(db.as(scorer, "SELECT public.correct_set_score($1, 2, 10, 10, 'x')", [live.id]), /latest started set/);
  await assert.rejects(db.as(scorer, "SELECT public.correct_set_score($1, 3, 10, 10, '')", [live.id]), /reason is required/);
  await assert.rejects(db.as(scorer, "SELECT public.correct_set_score($1, 3, 40, 10, 'typo')", [live.id]), /cannot occur/);

  await db.as(scorer, "SELECT public.correct_set_score($1, 3, 17, 16, 'scored for the wrong team')", [live.id]);
  const set3 = await db.one('SELECT home_score, away_score, status FROM public.match_sets WHERE match_id=$1 AND set_number=3', [live.id]);
  assert.deepEqual(set3, { home_score: 17, away_score: 16, status: 'LIVE' });
  await assert.rejects(db.as(scorer, 'SELECT public.undo_last_score_event($1)', [live.id]), /corrected manually/);

  // Correcting to a finishing score completes the set; set 3 won => 2-1 in a best of 5, still going.
  await db.as(scorer, "SELECT public.correct_set_score($1, 3, 25, 10, 'fix')", [live.id]);
  assert.equal((await db.one("SELECT status FROM public.match_sets WHERE match_id=$1 AND set_number=4", [live.id])).status, 'LIVE');
  assert.equal((await db.one('SELECT status FROM public.matches WHERE id=$1', [live.id])).status, 'LIVE');

  // Completed match: scorer is refused, organizer can reopen by correcting, standings follow.
  const done = await db.one("SELECT id FROM public.matches WHERE stage_id=$1 AND status='COMPLETED' LIMIT 1", [STAGE3]);
  await assert.rejects(db.as(scorer, "SELECT public.reset_match($1, 'x')", [done.id]), /Only an organizer/);
  await db.as(ORGANIZER, "SELECT public.reset_match($1, 'played on the wrong court')", [done.id]);
  const reset = await db.one('SELECT status, winner_team_id FROM public.matches WHERE id=$1', [done.id]);
  assert.deepEqual([reset.status, reset.winner_team_id], ['SCHEDULED', null]);
  assert.equal((await db.one("SELECT count(*)::int c FROM public.match_sets WHERE match_id=$1 AND (home_score>0 OR away_score>0 OR status<>'PENDING')", [done.id])).c, 0);
  assert.ok(await db.one("SELECT 1 FROM public.audit_logs WHERE action='MATCH_RESET' AND entity_id=$1", [done.id]));
}));
