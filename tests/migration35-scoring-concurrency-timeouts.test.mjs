import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const DATABASE_URL = process.env.M35_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function createPgClient() {
  return new Client({
    connectionString: DATABASE_URL,
    statement_timeout: 5000,
    query_timeout: 5000,
  });
}

async function connectClient(client) {
  await client.connect();
  await client.query(`SET statement_timeout = '5s'`);
}

async function settleBlockedOperation(promise, clientHoldingLock) {
  await new Promise(resolve => setTimeout(resolve, 75));
  await clientHoldingLock.query('COMMIT');
  return promise;
}

const ids = {
  organizer: '90000000-0000-0000-0000-000000000001',
  scorer1: '90000000-0000-0000-0000-000000000004',
  scorer2: '90000000-0000-0000-0000-000000000003',
  org: '90100000-0000-0000-0000-000000000001',
  tournament: '95500000-0000-0000-0002-000000000001',
  stage: '95500000-0000-0000-0002-000000000002',
  teamA: '95500000-0000-0000-0003-000000000001',
  teamB: '95500000-0000-0000-0003-000000000002',
  match: '95500000-0000-0000-0004-000000000001',
  rule: '95500000-0000-0000-0005-000000000001',
};

async function resetFixture(adminClient, initialMatchStatus = 'SCHEDULED') {
  await adminClient.query(`

    DELETE FROM public.match_timeouts WHERE match_id = '${ids.match}';
    DELETE FROM public.score_events WHERE match_id = '${ids.match}';
    DELETE FROM public.match_sets WHERE match_id = '${ids.match}';
    DELETE FROM public.match_scorers WHERE match_id = '${ids.match}';
    DELETE FROM public.matches WHERE id = '${ids.match}';
    DELETE FROM public.tournament_members WHERE tournament_id = '${ids.tournament}';
    DELETE FROM public.volleyball_rules WHERE tournament_id = '${ids.tournament}';
    DELETE FROM public.tournament_stages WHERE tournament_id = '${ids.tournament}';
    DELETE FROM public.teams WHERE tournament_id = '${ids.tournament}';
    DELETE FROM public.tournaments WHERE id = '${ids.tournament}';

    INSERT INTO public.tournaments(id, organization_id, name, slug, format, league_mode, status, approval_status, is_public, created_by)
    VALUES('${ids.tournament}', '${ids.org}', 'M35 Test', 'm35-test', 'LEAGUE', 'REGISTERED_TEAM', 'LIVE', 'APPROVED', true, '${ids.organizer}');

    INSERT INTO public.tournament_stages(id, tournament_id, name, stage_type, sequence, status)
    VALUES('${ids.stage}', '${ids.tournament}', 'Stage 1', 'LEAGUE', 1, 'ACTIVE');

    INSERT INTO public.teams(id, tournament_id, name, status)
    VALUES('${ids.teamA}', '${ids.tournament}', 'Team Alpha', 'ACTIVE'),
          ('${ids.teamB}', '${ids.tournament}', 'Team Beta', 'ACTIVE');

    INSERT INTO public.volleyball_rules(id, tournament_id, stage_id, sets_to_win, win_by_two, timeouts_per_set, timeout_duration_seconds)
    VALUES('${ids.rule}', '${ids.tournament}', '${ids.stage}', 2, true, 2, 30);

    INSERT INTO public.volleyball_set_rules(volleyball_rule_id, set_number, target_points)
    VALUES('${ids.rule}', 1, 25), ('${ids.rule}', 2, 25), ('${ids.rule}', 3, 15);

    INSERT INTO public.matches(id, tournament_id, stage_id, match_number, home_team_id, away_team_id, status)
    VALUES('${ids.match}', '${ids.tournament}', '${ids.stage}', 1, '${ids.teamA}', '${ids.teamB}', '${initialMatchStatus}');

    INSERT INTO public.match_sets(id, match_id, set_number, target_points, status)
    VALUES('95500000-0000-0000-0006-000000000001', '${ids.match}', 1, 25, 'PENDING'),
          ('95500000-0000-0000-0006-000000000002', '${ids.match}', 2, 25, 'PENDING'),
          ('95500000-0000-0000-0006-000000000003', '${ids.match}', 3, 15, 'PENDING');

    -- Setup staff roles
    INSERT INTO public.tournament_members(tournament_id, user_id, role, status)
    VALUES('${ids.tournament}', '${ids.scorer1}', 'SCORER', 'ACTIVE'),
          ('${ids.tournament}', '${ids.scorer2}', 'SCORER', 'ACTIVE');

    -- Assign scorers to match
    INSERT INTO public.match_scorers(match_id, user_id, assigned_by)
    VALUES('${ids.match}', '${ids.scorer1}', '${ids.organizer}'),
          ('${ids.match}', '${ids.scorer2}', '${ids.organizer}');
  `);
}

async function asUser(client, userId) {
  await client.query(`SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
}

test('1. Single point correctly transitions SCHEDULED to LIVE with sequence = 1', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  try {
    await connectClient(admin);
    await connectClient(c1);
    await resetFixture(admin, 'SCHEDULED');
    await asUser(c1, ids.scorer1);

    const res = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'single-1') AS state;`);
    assert.equal(res.rows[0].state.home_score, 1);
    assert.equal(res.rows[0].state.away_score, 0);

    const matchRow = await admin.query(`SELECT status FROM public.matches WHERE id = '${ids.match}';`);
    assert.equal(matchRow.rows[0].status, 'LIVE');

    const evts = await admin.query(`SELECT sequence_number, event_type FROM public.score_events WHERE match_id = '${ids.match}';`);
    assert.equal(evts.rows.length, 1);
    assert.equal(evts.rows[0].sequence_number, '1');
    assert.equal(evts.rows[0].event_type, 'POINT');
  } finally {
    await c1.end();
    await admin.end();
  }
});

test('2. Same idempotency key submitted concurrently produces exactly 1 point and 1 score event', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  const c2 = createPgClient();
  try {
    await connectClient(admin);
    await connectClient(c1);
    await connectClient(c2);
    await resetFixture(admin, 'LIVE');
    await asUser(c1, ids.scorer1);
    await asUser(c2, ids.scorer1);

    const key = 'idem-same-key';
    const [r1, r2] = await Promise.all([
      c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', '${key}') AS state;`),
      c2.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', '${key}') AS state;`),
    ]);

    assert.equal(r1.rows[0].state.home_score, 1);
    assert.equal(r2.rows[0].state.home_score, 1);

    const evts = await admin.query(`SELECT sequence_number FROM public.score_events WHERE match_id = '${ids.match}';`);
    assert.equal(evts.rows.length, 1);
    assert.equal(evts.rows[0].sequence_number, '1');
  } finally {
    await c1.end();
    await c2.end();
    await admin.end();
  }
});

test('3. Rapid concurrent points from two scorers serialize monotonically: sequences 1, 2, 3...', async () => {
  const admin = createPgClient();
  const clients = await Promise.all(Array.from({ length: 6 }, () => createPgClient()));
  try {
    await connectClient(admin);
    await Promise.all(clients.map(connectClient));
    await resetFixture(admin, 'SCHEDULED');

    // Scorer 1 (c0..c2) and Scorer 2 (c3..c5) submit 6 distinct points simultaneously
    const promises = clients.map((c, idx) => {
      const user = idx < 3 ? ids.scorer1 : ids.scorer2;
      const team = idx % 2 === 0 ? ids.teamA : ids.teamB;
      return (async () => {
        await asUser(c, user);
        return c.query(`SELECT public.award_point('${ids.match}', '${team}', 'rapid-pt-${idx}') AS state;`);
      })();
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      assert.equal(r.status, 'fulfilled');
    }

    const evts = await admin.query(`SELECT sequence_number, event_type FROM public.score_events WHERE match_id = '${ids.match}' ORDER BY sequence_number ASC;`);
    assert.equal(evts.rows.length, 6);
    const seqs = evts.rows.map(r => Number(r.sequence_number));
    assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6]);

    // Verify Set 1 scores add up to 6
    const set1 = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id = '${ids.match}' AND set_number = 1;`);
    assert.equal(set1.rows[0].home_score + set1.rows[0].away_score, 6);
  } finally {
    for (const c of clients) await c.end();
    await admin.end();
  }
});

test('4. Repeated UNDO and POINT + UNDO step backward chronologically without sequence collision', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  try {
    await connectClient(admin);
    await connectClient(c1);
    await resetFixture(admin, 'LIVE');
    await asUser(c1, ids.scorer1);

    // 1. Point for A (seq 1, score 1-0)
    await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'k1');`);
    // 2. Point for A (seq 2, score 2-0)
    await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'k2');`);
    // 3. Undo (seq 3, score 1-0)
    const u1 = await c1.query(`SELECT public.undo_last_score_event('${ids.match}') AS state;`);
    assert.equal(u1.rows[0].state.home_score, 1);
    // 4. Undo AGAIN (seq 4, score 0-0) -> Must not crash with duplicate sequence error!
    const u2 = await c1.query(`SELECT public.undo_last_score_event('${ids.match}') AS state;`);
    assert.equal(u2.rows[0].state.home_score, 0);

    // 5. Point for B (seq 5, score 0-1)
    const pB = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'k3') AS state;`);
    assert.equal(pB.rows[0].state.away_score, 1);

    // Verify sequence monotonicity: [1, 2, 3, 4, 5]
    const evts = await admin.query(`SELECT sequence_number, event_type FROM public.score_events WHERE match_id = '${ids.match}' ORDER BY sequence_number ASC;`);
    const seqs = evts.rows.map(r => Number(r.sequence_number));
    assert.deepEqual(seqs, [1, 2, 3, 4, 5]);
    assert.deepEqual(evts.rows.map(r => r.event_type), ['POINT', 'POINT', 'UNDO', 'UNDO', 'POINT']);
  } finally {
    await c1.end();
    await admin.end();
  }
});

test('5. Volleyball generic deuce logic: 24-24 continues, 26-24 completes, 16-14 target 15 completes', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  try {
    await connectClient(admin);
    await connectClient(c1);
    await resetFixture(admin, 'LIVE');
    await asUser(c1, ids.organizer);

    // Fast forward to 24-24 in Set 1
    await admin.query(`UPDATE public.match_sets SET home_score = 24, away_score = 24, status = 'LIVE' WHERE match_id = '${ids.match}' AND set_number = 1;`);

    // Home scores -> 25-24: NOT won yet because lead is only 1
    const p1 = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'deuce-1') AS state;`);
    assert.equal(p1.rows[0].state.home_score, 25);
    assert.equal(p1.rows[0].state.away_score, 24);
    assert.equal(p1.rows[0].state.set_winner, null);

    // Away scores -> 25-25: Still tied
    const p2 = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'deuce-2') AS state;`);
    assert.equal(p2.rows[0].state.home_score, 25);
    assert.equal(p2.rows[0].state.away_score, 25);
    assert.equal(p2.rows[0].state.set_winner, null);

    // Home scores -> 26-25: Lead 1, continues
    const p3 = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'deuce-3') AS state;`);
    assert.equal(p3.rows[0].state.home_score, 26);
    assert.equal(p3.rows[0].state.away_score, 25);
    assert.equal(p3.rows[0].state.set_winner, null);

    // Home scores -> 27-25: Lead 2, target reached -> Set 1 completes!
    const p4 = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'deuce-4') AS state;`);
    assert.equal(p4.rows[0].state.home_score, 27);
    assert.equal(p4.rows[0].state.set_winner, ids.teamA);

    // Set 1 should be COMPLETED, Set 2 auto-activated to LIVE
    const set1 = await admin.query(`SELECT status, winner_team_id FROM public.match_sets WHERE match_id = '${ids.match}' AND set_number = 1;`);
    assert.equal(set1.rows[0].status, 'COMPLETED');
    assert.equal(set1.rows[0].winner_team_id, ids.teamA);

    const set2 = await admin.query(`SELECT status FROM public.match_sets WHERE match_id = '${ids.match}' AND set_number = 2;`);
    assert.equal(set2.rows[0].status, 'LIVE');
  } finally {
    await c1.end();
    await admin.end();
  }
});

test('6. Volleyball Timeout: calling timeout, enforcement of limit per set, no score change, and blocking points', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  try {
    await connectClient(admin);
    await connectClient(c1);
    await resetFixture(admin, 'LIVE');
    await asUser(c1, ids.scorer1);

    // Award initial point
    await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'pre-timeout-pt');`);

    // Call Timeout 1 for Team A
    const t1 = await c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}') AS res;`);
    assert.equal(t1.rows[0].res.ok, true);
    assert.equal(t1.rows[0].res.timeout_number, 1);

    // Calling award_point while timeout is actively running should raise exception
    await assert.rejects(
      c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'during-timeout-pt');`),
      /Cannot award point while a timeout is actively running/
    );

    // Calling timeout again for same team while active should return existing state (idempotent for double taps)
    const tDouble = await c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}') AS res;`);
    assert.equal(tDouble.rows[0].res.already_active, true);

    // End timeout early
    const endRes = await c1.query(`SELECT public.end_match_timeout('${ids.match}') AS res;`);
    assert.equal(endRes.rows[0].res.ended, true);

    // Now award_point should succeed
    const ptAfter = await c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'after-timeout-pt') AS res;`);
    assert.equal(ptAfter.rows[0].res.home_score, 2);

    // Call Timeout 2 for Team A (allowed, limit is 2)
    const t2 = await c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}') AS res;`);
    assert.equal(t2.rows[0].res.timeout_number, 2);
    await c1.query(`SELECT public.end_match_timeout('${ids.match}');`);

    // Call Timeout 3 for Team A (limit exceeded, must fail)
    await assert.rejects(
      c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}');`),
      /Team has already used all allowed timeouts for this set/
    );

    // Team B can still call timeout (separate allowance)
    const tB = await c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamB}') AS res;`);
    assert.equal(tB.rows[0].res.timeout_number, 1);
    assert.equal(tB.rows[0].res.team_id, ids.teamB);
    await c1.query(`SELECT public.end_match_timeout('${ids.match}');`);

    // Verify match state includes timeouts payload
    const stateRes = await c1.query(`SELECT public.get_scorer_match_state('${ids.match}') AS state;`);
    const timeouts = stateRes.rows[0].state.timeouts;
    assert.equal(timeouts.max_per_set, 2);
    assert.equal(timeouts.home_used, 2);
    assert.equal(timeouts.away_used, 1);
  } finally {
    await c1.end();
    await admin.end();
  }
});

test('7. Same scorer with different keys records both actions in serialized order', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  const c2 = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(c1), connectClient(c2)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(c1, ids.scorer1), asUser(c2, ids.scorer1)]);

    await Promise.all([
      c1.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'same-scorer-a')`),
      c2.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'same-scorer-b')`),
    ]);

    const events = await admin.query(`
      SELECT sequence_number, idempotency_key FROM public.score_events
      WHERE match_id = $1 ORDER BY sequence_number`, [ids.match]);
    assert.deepEqual(events.rows.map(row => Number(row.sequence_number)), [1, 2]);
    assert.deepEqual(new Set(events.rows.map(row => row.idempotency_key)), new Set(['same-scorer-a', 'same-scorer-b']));
    const score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 1, away_score: 1 });
  } finally {
    await Promise.allSettled([c1.query('ROLLBACK'), c2.query('ROLLBACK')]);
    await Promise.allSettled([c1.end(), c2.end(), admin.end()]);
  }
});

test('8. Organizer and assigned scorer concurrently produce two unique ordered events without a lost update', async () => {
  const admin = createPgClient();
  const organizer = createPgClient();
  const scorer = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(organizer), connectClient(scorer)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(organizer, ids.organizer), asUser(scorer, ids.scorer1)]);

    await Promise.all([
      organizer.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'organizer-point')`),
      scorer.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'scorer-point')`),
    ]);

    const events = await admin.query(`SELECT sequence_number FROM public.score_events WHERE match_id=$1 ORDER BY sequence_number`, [ids.match]);
    assert.deepEqual(events.rows.map(row => Number(row.sequence_number)), [1, 2]);
    const score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 1, away_score: 1 });
  } finally {
    await Promise.allSettled([organizer.query('ROLLBACK'), scorer.query('ROLLBACK')]);
    await Promise.allSettled([organizer.end(), scorer.end(), admin.end()]);
  }
});

test('9. POINT and UNDO race serializes into an append-only stream with an authoritative score', async () => {
  const admin = createPgClient();
  const pointClient = createPgClient();
  const undoClient = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(pointClient), connectClient(undoClient)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(pointClient, ids.scorer1), asUser(undoClient, ids.scorer2)]);
    await pointClient.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'seed-point')`);

    await pointClient.query('BEGIN');
    await pointClient.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'racing-point')`);
    const blockedUndo = undoClient.query(`SELECT public.undo_last_score_event('${ids.match}')`);
    await settleBlockedOperation(blockedUndo, pointClient);

    const events = await admin.query(`
      SELECT sequence_number, event_type, home_score_after, away_score_after
      FROM public.score_events WHERE match_id=$1 ORDER BY sequence_number`, [ids.match]);
    assert.deepEqual(events.rows.map(row => Number(row.sequence_number)), [1, 2, 3]);
    assert.deepEqual(events.rows.map(row => row.event_type), ['POINT', 'POINT', 'UNDO']);
    assert.deepEqual(
      { home_score: events.rows[2].home_score_after, away_score: events.rows[2].away_score_after },
      { home_score: 1, away_score: 0 },
    );
    const score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 1, away_score: 0 });
  } finally {
    await Promise.allSettled([pointClient.query('ROLLBACK'), undoClient.query('ROLLBACK')]);
    await Promise.allSettled([pointClient.end(), undoClient.end(), admin.end()]);
  }
});

test('10. Timeout start and point serialize in both orders and never corrupt score', async () => {
  const admin = createPgClient();
  const first = createPgClient();
  const second = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(first), connectClient(second)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(first, ids.scorer1), asUser(second, ids.scorer2)]);

    // Timeout commits first: the waiting point must re-read timeout state and fail.
    await first.query('BEGIN');
    await first.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}')`);
    const blockedPoint = second.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'timeout-first-point')`);
    await assert.rejects(settleBlockedOperation(blockedPoint, first), /actively running/);
    let score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 0, away_score: 0 });
    await first.query(`SELECT public.end_match_timeout('${ids.match}')`);

    // Point commits first: timeout waits, then observes the authoritative score.
    await first.query('BEGIN');
    await first.query(`SELECT public.award_point('${ids.match}', '${ids.teamB}', 'point-first')`);
    const blockedTimeout = second.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamB}')`);
    await settleBlockedOperation(blockedTimeout, first);
    score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 0, away_score: 1 });
    assert.equal((await admin.query(`SELECT count(*)::int n FROM public.match_timeouts WHERE match_id=$1 AND ended_at IS NULL`, [ids.match])).rows[0].n, 1);
  } finally {
    await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
    await Promise.allSettled([first.end(), second.end(), admin.end()]);
  }
});

test('11. Simultaneous timeout calls create one active timeout and do not exceed allowance', async () => {
  const admin = createPgClient();
  const c1 = createPgClient();
  const c2 = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(c1), connectClient(c2)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(c1, ids.scorer1), asUser(c2, ids.scorer2)]);

    const results = await Promise.all([
      c1.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}') AS state`),
      c2.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}') AS state`),
    ]);
    assert.equal(results.filter(result => result.rows[0].state.already_active === true).length, 1);
    const rows = await admin.query(`SELECT timeout_number, ended_at FROM public.match_timeouts WHERE match_id=$1`, [ids.match]);
    assert.equal(rows.rows.length, 1);
    assert.equal(rows.rows[0].timeout_number, 1);
    assert.equal(rows.rows[0].ended_at, null);
  } finally {
    await Promise.allSettled([c1.query('ROLLBACK'), c2.query('ROLLBACK')]);
    await Promise.allSettled([c1.end(), c2.end(), admin.end()]);
  }
});

test('12. Timeout end and point race is serialized with no invalid intermediate state', async () => {
  const admin = createPgClient();
  const endClient = createPgClient();
  const pointClient = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(endClient), connectClient(pointClient)]);
    await resetFixture(admin, 'LIVE');
    await Promise.all([asUser(endClient, ids.scorer1), asUser(pointClient, ids.scorer2)]);
    await endClient.query(`SELECT public.call_match_timeout('${ids.match}', '${ids.teamA}')`);

    await endClient.query('BEGIN');
    await endClient.query(`SELECT public.end_match_timeout('${ids.match}')`);
    const blockedPoint = pointClient.query(`SELECT public.award_point('${ids.match}', '${ids.teamA}', 'after-concurrent-end')`);
    await settleBlockedOperation(blockedPoint, endClient);

    const score = await admin.query(`SELECT home_score, away_score FROM public.match_sets WHERE match_id=$1 AND set_number=1`, [ids.match]);
    assert.deepEqual(score.rows[0], { home_score: 1, away_score: 0 });
    assert.equal((await admin.query(`SELECT count(*)::int n FROM public.match_timeouts WHERE match_id=$1 AND ended_at IS NULL`, [ids.match])).rows[0].n, 0);
  } finally {
    await Promise.allSettled([endClient.query('ROLLBACK'), pointClient.query('ROLLBACK')]);
    await Promise.allSettled([endClient.end(), pointClient.end(), admin.end()]);
  }
});

test('13. Deuce boundary matrix covers target 25, target 15, and win_by_two=false', async () => {
  const admin = createPgClient();
  const scorer = createPgClient();
  try {
    await Promise.all([connectClient(admin), connectClient(scorer)]);
    await asUser(scorer, ids.organizer);

    const cases = [
      [24, 23, ids.teamB, 24, 24, null],
      [24, 24, ids.teamA, 25, 24, null],
      [25, 24, ids.teamB, 25, 25, null],
      [25, 25, ids.teamA, 26, 25, null],
      [25, 24, ids.teamA, 26, 24, ids.teamA],
      [29, 28, ids.teamA, 30, 28, ids.teamA],
    ];
    for (const [home, away, team, expectedHome, expectedAway, winner] of cases) {
      await resetFixture(admin, 'LIVE');
      await admin.query(`UPDATE public.match_sets SET home_score=$2, away_score=$3, status='LIVE' WHERE match_id=$1 AND set_number=1`, [ids.match, home, away]);
      const result = await scorer.query(`SELECT public.award_point($1,$2,$3) state`, [ids.match, team, `deuce-${home}-${away}-${team}`]);
      assert.deepEqual(
        [result.rows[0].state.home_score, result.rows[0].state.away_score, result.rows[0].state.set_winner],
        [expectedHome, expectedAway, winner],
      );
    }

    await resetFixture(admin, 'LIVE');
    await admin.query(`UPDATE public.match_sets SET home_score=15, away_score=14, status='LIVE' WHERE match_id=$1 AND set_number=3`, [ids.match]);
    await admin.query(`UPDATE public.match_sets SET status='COMPLETED', winner_team_id=$2 WHERE match_id=$1 AND set_number IN (1,2)`, [ids.match, ids.teamA]);
    // Keep the match live to test the deciding-set threshold itself.
    const target15 = await scorer.query(`SELECT public.award_point($1,$2,'target-15') state`, [ids.match, ids.teamA]);
    assert.equal(target15.rows[0].state.home_score, 16);
    assert.equal(target15.rows[0].state.set_winner, ids.teamA);

    await resetFixture(admin, 'LIVE');
    await admin.query(`UPDATE public.volleyball_rules SET win_by_two=false WHERE id=$1`, [ids.rule]);
    await admin.query(`UPDATE public.match_sets SET home_score=24, away_score=24, status='LIVE' WHERE match_id=$1 AND set_number=1`, [ids.match]);
    const noDeuce = await scorer.query(`SELECT public.award_point($1,$2,'no-win-by-two') state`, [ids.match, ids.teamA]);
    assert.equal(noDeuce.rows[0].state.home_score, 25);
    assert.equal(noDeuce.rows[0].state.away_score, 24);
    assert.equal(noDeuce.rows[0].state.set_winner, ids.teamA);
  } finally {
    await Promise.allSettled([scorer.query('ROLLBACK')]);
    await Promise.allSettled([scorer.end(), admin.end()]);
  }
});
