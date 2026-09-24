import assert from 'node:assert/strict';
import pg from 'pg';

const connectionString = process.env.M26_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const matchId = '90700000-0000-0000-0000-000000000001';
const homeTeamId = '90300000-0000-0000-0000-000000000001';
const scorerId = '90000000-0000-0000-0000-000000000004';
const ownerId = '90000000-0000-0000-0000-000000000002';
const requestKey = `qa-point-${crypto.randomUUID()}`;

async function asUser(userId) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query('SET ROLE authenticated');
  await client.query('SELECT set_config($1,$2,false)', ['request.jwt.claim.sub', userId]);
  return client;
}

const scorer = await asUser(scorerId);
const owner = await asUser(ownerId);
const admin = new pg.Client({ connectionString });
await admin.connect();

const initial = (await scorer.query('SELECT public.get_scorer_match_state($1) AS value', [matchId])).rows[0].value;
assert.ok(['SCHEDULED', 'LIVE'].includes(initial.match.status));
assert.equal(initial.sets[0].home_score, 0);

const first = (await scorer.query('SELECT public.award_point($1,$2,$3) AS value', [matchId, homeTeamId, requestKey])).rows[0].value;
const retry = (await scorer.query('SELECT public.award_point($1,$2,$3) AS value', [matchId, homeTeamId, requestKey])).rows[0].value;
assert.deepEqual(retry, first, 'duplicate point request returns the authoritative prior result');
assert.equal((await scorer.query('SELECT count(*) FROM public.score_events WHERE match_id=$1 AND event_type=\'POINT\'', [matchId])).rows[0].count, '1');

const afterPoint = (await scorer.query('SELECT public.get_scorer_match_state($1) AS value', [matchId])).rows[0].value;
assert.equal(afterPoint.sets[0].home_score, 1);

await scorer.query('SELECT public.undo_last_score_event($1)', [matchId]);
const afterUndo = (await scorer.query('SELECT public.get_scorer_match_state($1) AS value', [matchId])).rows[0].value;
assert.equal(afterUndo.sets[0].home_score, 0);
await assert.rejects(owner.query('SELECT public.get_scorer_match_state($1)', [matchId]), /Unauthorized/);

await Promise.all([scorer.end(), owner.end(), admin.end()]);
console.log('Migration 26 scoring: PASS (authorization, idempotency, undo)');