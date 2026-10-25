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
