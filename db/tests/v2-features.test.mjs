// v2 feature checks against the local synthetic seed. Every test runs in its own
// transaction and rolls back, so the seed is left untouched.
// Run: node --test db/tests/v2-features.test.mjs (after `supabase db reset --local`)
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5440/tourny';
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

const STAGE1 = '90500000-0000-0000-0000-000000000001';

test('walkover and draw: points, standings and locks', () => inTransaction(async (db) => {
  const m = await db.one("SELECT id, home_team_id, away_team_id FROM public.matches WHERE stage_id=$1 AND status='SCHEDULED' ORDER BY program_order LIMIT 1", [STAGE3]);
  const stand = (team) => db.one('SELECT played, won, lost, drawn, league_points, sets_won, sets_lost, points_for FROM public.standings WHERE team_id=$1 AND stage_id=$2', [team, STAGE3]);
  const before = await stand(m.home_team_id);
  const scorer = '90000000-0000-0000-0000-000000000004';
  await assert.rejects(db.as(scorer, "SELECT public.declare_match_result($1, 'DRAW', NULL, 'x')", [m.id]), /Unauthorized/);
  await assert.rejects(db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'WALKOVER', $2, 'no show')", [m.id, '90300000-0000-0000-0000-00000000dead']), /one of the two teams/);
  await assert.rejects(db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'DRAW', NULL, '')", [m.id]), /reason is required/);

  await db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'WALKOVER', $2, 'Away team did not show up')", [m.id, m.home_team_id]);
  const won = await stand(m.home_team_id);
  assert.equal(won.won, before.won + 1);
  const winPoints = (await db.one('SELECT COALESCE((SELECT win_points FROM public.standings_rules WHERE stage_id=$1), 2) AS p', [STAGE3])).p;
  assert.equal(won.league_points, before.league_points + winPoints);
  assert.equal(won.sets_won, before.sets_won + 3);
  assert.equal(won.points_for, before.points_for);
  assert.equal((await db.one('SELECT result_type FROM public.matches WHERE id=$1', [m.id])).result_type, 'WALKOVER');

  // Replace the walkover with a draw: 1 point each by default.
  await db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'DRAW', NULL, 'Both teams agreed')", [m.id]);
  const drawn = await stand(m.home_team_id);
  assert.deepEqual([drawn.drawn, drawn.won, drawn.league_points], [before.drawn + 1, before.won, before.league_points + 1]);
  assert.equal((await stand(m.away_team_id)).drawn, 1 + (await db.one('SELECT drawn FROM public.standings WHERE team_id=$1 AND stage_id=$2', [m.away_team_id, STAGE3])).drawn - 1);

  await db.as(ORGANIZER, `SELECT public.save_standings_rules($1, $2, 0, '["WINS","NAME"]'::jsonb, 3)`, [STAGE3, winPoints]);
  await db.one('UPDATE public.matches SET status = status WHERE id=$1', [m.id]);
  assert.equal((await stand(m.home_team_id)).league_points, before.league_points + 3);

  // Reset puts it back to a normal unplayed match.
  await db.as(ORGANIZER, "SELECT public.reset_match($1, 'declared by mistake')", [m.id]);
  const back = await db.one('SELECT status, result_type FROM public.matches WHERE id=$1', [m.id]);
  assert.deepEqual(back, { status: 'SCHEDULED', result_type: 'PLAYED' });
  assert.equal((await stand(m.home_team_id)).drawn, before.drawn);
}));

test('draw is league-only; a knockout walkover advances the winner', () => inTransaction(async (db) => {
  const ko = await db.one(`
    WITH s AS (INSERT INTO public.tournament_stages (tournament_id, name, stage_type, sequence, status) VALUES ($1, 'KO', 'KNOCKOUT', 9, 'ACTIVE') RETURNING id)
    SELECT id FROM s`, [T3]);
  const teams = (await db.one('SELECT array_agg(id ORDER BY id) t FROM public.teams WHERE tournament_id=$1', [T3])).t;
  const final = await db.one("INSERT INTO public.matches (tournament_id, stage_id, match_number, round_number, bracket_position, bracket_match_type, status) VALUES ($1,$2,2,2,1,'FINAL','SCHEDULED') RETURNING id", [T3, ko.id]);
  const semi = await db.one("INSERT INTO public.matches (tournament_id, stage_id, match_number, round_number, bracket_position, bracket_match_type, home_team_id, away_team_id, status, next_match_id, next_match_slot, sets_to_win, win_by_two) VALUES ($1,$2,1,1,1,'SEMIFINAL',$3,$4,'SCHEDULED',$5,'HOME',2,true) RETURNING id", [T3, ko.id, teams[0], teams[1], final.id]);
  await db.one("INSERT INTO public.volleyball_rules (tournament_id, stage_id, sets_to_win, win_by_two) VALUES ($1,$2,2,true)", [T3, ko.id]);
  await db.one("INSERT INTO public.volleyball_set_rules (volleyball_rule_id, set_number, target_points) SELECT id, n, 25 FROM public.volleyball_rules, generate_series(1,3) n WHERE stage_id=$1", [ko.id]);
  await assert.rejects(db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'DRAW', NULL, 'x')", [semi.id]), /Only league matches/);
  await db.as(ORGANIZER, "SELECT public.declare_match_result($1, 'WALKOVER', $2, 'forfeit')", [semi.id, teams[1]]);
  assert.equal((await db.one('SELECT home_team_id FROM public.matches WHERE id=$1', [final.id])).home_team_id, teams[1]);
}));

test('court setup: toss is stored, serve follows points and undo, reset forgets the toss', () => inTransaction(async (db) => {
  const m = await db.one("SELECT id, home_team_id, away_team_id FROM public.matches WHERE stage_id=$1 AND status='SCHEDULED' AND home_team_id IS NOT NULL ORDER BY program_order LIMIT 1", [STAGE3]);
  const state = async () => (await db.one('SELECT public.get_public_match_state($1) AS s', [m.id])).s.sets[0];
  await assert.rejects(db.as('90000000-0000-0000-0000-000000000140', 'SELECT public.set_match_setup($1, 1, $2, $2)', [m.id, m.home_team_id]), /Unauthorized/);
  await assert.rejects(db.as(ORGANIZER, 'SELECT public.set_match_setup($1, 1, $2, $3)', [m.id, m.home_team_id, '90300000-0000-0000-0000-00000000dead']), /one of the two teams/);

  await db.as(ORGANIZER, 'SELECT public.set_match_setup($1, 1, $2, $3)', [m.id, m.away_team_id, m.home_team_id]);
  let set1 = await state();
  assert.deepEqual([set1.left_team_id, set1.first_serve_team_id, set1.serving_team_id], [m.away_team_id, m.home_team_id, m.home_team_id]);

  await db.as(ORGANIZER, 'SELECT public.award_point($1, $2, $3)', [m.id, m.away_team_id, 'p1']);
  await db.as(ORGANIZER, 'SELECT public.award_point($1, $2, $3)', [m.id, m.home_team_id, 'p2']);
  assert.equal((await state()).serving_team_id, m.home_team_id);
  await db.as(ORGANIZER, 'SELECT public.undo_last_score_event($1)', [m.id]);
  assert.equal((await state()).serving_team_id, m.away_team_id);

  await db.as(ORGANIZER, "SELECT public.reset_match($1, 'start again')", [m.id]);
  set1 = await state();
  assert.deepEqual([set1.left_team_id, set1.serving_team_id], [null, null]);
}));

test('team profiles: reused across tournaments, owner-only, created on first approval', () => inTransaction(async (db) => {
  const owner = '90000000-0000-0000-0000-000000000141';
  const stranger = '90000000-0000-0000-0000-000000000142';
  // First approval creates a profile for the new team.
  const { id: first } = await db.as(owner, "SELECT public.submit_team_owner_application($1, 'Reuse VC', 'RVC', 'logos/a.png', NULL, NULL, NULL, '#112233', '#ffffff') AS id", [T1]);
  await db.as(ORGANIZER, 'SELECT public.approve_team_owner_application($1)', [first]);
  const team = await db.one("SELECT team_profile_id FROM public.teams WHERE tournament_id=$1 AND name='Reuse VC'", [T1]);
  const profile = await db.one('SELECT owner_user_id, primary_color FROM public.team_profiles WHERE id=$1', [team.team_profile_id]);
  assert.deepEqual([profile.owner_user_id, profile.primary_color], [owner, '#112233']);

  // Applying again with the profile in a second tournament links the same profile; others cannot use it.
  const T4 = '90200000-0000-0000-0000-000000000004';
  await db.one("UPDATE public.tournaments SET status='REGISTRATION' WHERE id=$1", [T4]);
  await db.one("UPDATE public.tournament_settings SET team_registration_enabled=true, max_teams=NULL WHERE tournament_id=$1", [T4]);
  await assert.rejects(db.as(stranger, "SELECT public.submit_team_owner_application($1, 'Reuse VC', NULL, 'logos/a.png', NULL, NULL, NULL, NULL, NULL, $2)", [T4, team.team_profile_id]), /Team profile not found/);
  const { id: second } = await db.as(owner, "SELECT public.submit_team_owner_application($1, 'Reuse VC', 'RVC', 'logos/a.png', NULL, NULL, NULL, '#445566', NULL, $2) AS id", [T4, team.team_profile_id]);
  await db.as(ORGANIZER, 'SELECT public.approve_team_owner_application($1)', [second]);
  const linked = await db.one("SELECT count(*)::int n, count(DISTINCT team_profile_id)::int p FROM public.teams WHERE name='Reuse VC'");
  assert.deepEqual([linked.n, linked.p], [2, 1]);
  assert.equal((await db.one('SELECT primary_color FROM public.team_profiles WHERE id=$1', [team.team_profile_id])).primary_color, '#445566');
  await assert.rejects(db.as(owner, "SELECT public.submit_team_owner_application($1, 'Reuse VC', NULL, 'logos/a.png', NULL, NULL, NULL, NULL, NULL, $2)", [T1, team.team_profile_id]), /already in the tournament|Application already exists/);
}));

test('stats: team and player totals come from completed public matches', () => inTransaction(async (db) => {
  const team = await db.one("SELECT id FROM public.teams WHERE name='Mangrove Mavericks'");
  const { s } = await db.one('SELECT public.get_team_stats($1) AS s', [team.id]);
  const standing = await db.one('SELECT played, won, lost, sets_won, sets_lost, points_for, points_against FROM public.standings WHERE team_id=$1', [team.id]);
  const t = s.stats.totals;
  assert.deepEqual([t.played, t.won, t.lost, t.sets_for, t.sets_against, t.points_for, t.points_against],
    [standing.played, standing.won, standing.lost, standing.sets_won, standing.sets_lost, standing.points_for, standing.points_against]);
  const player = await db.one('SELECT player_id FROM public.team_players WHERE team_id=$1 AND status=\'ACTIVE\' LIMIT 1', [team.id]);
  const { s: p } = await db.one('SELECT public.get_player_stats($1) AS s', [player.player_id]);
  assert.equal(p.stats.totals.played, t.played);
  await assert.rejects(db.one("SELECT public.get_player_stats('90400000-0000-0000-0000-00000000dead')"), /Player not available/);
}));
