import assert from 'node:assert/strict';
import pg from 'pg';

// Announcements, match check-in and duplicating a tournament, run as real signed-in roles inside a transaction that is rolled back.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5440/tourny' });
await client.connect();
const T3 = '90200000-0000-0000-0000-000000000003';

const as = async (email) => {
  await client.query('RESET ROLE');
  if (!email) { await client.query("SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)"); await client.query('SET LOCAL ROLE anon'); return; }
  const { rows } = await client.query('SELECT id FROM auth.users WHERE email=$1', [email]);
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: rows[0].id, role: 'authenticated' }), rows[0].id]);
  await client.query('SET LOCAL ROLE authenticated');
};
const call = async (sql, args = []) => (await client.query(sql, args)).rows;
const fails = async (sql, args, pattern) => {
  await client.query('SAVEPOINT s');
  try { await client.query(sql, args); } catch (e) { await client.query('ROLLBACK TO s'); assert.match(e.message, pattern); return; }
  await client.query('ROLLBACK TO s');
  assert.fail(`expected failure: ${pattern}`);
};

try {
  await client.query('BEGIN');
  const team = (await client.query('SELECT id FROM public.teams WHERE tournament_id=$1 ORDER BY name LIMIT 1', [T3])).rows[0].id;
  const match = (await client.query("SELECT id, home_team_id h, away_team_id a FROM public.matches WHERE tournament_id=$1 AND status='SCHEDULED' AND home_team_id IS NOT NULL ORDER BY program_order LIMIT 1", [T3])).rows[0];

  // A follower of the tournament and the owner of a team, both with a registered device.
  const ownerRow = (await client.query("SELECT o.user_id FROM public.team_owners o JOIN public.teams t ON t.id=o.team_id WHERE t.tournament_id=$1 AND o.status='ACTIVE' LIMIT 1", [T3])).rows[0];
  await client.query("INSERT INTO public.push_tokens (token, user_id, platform) VALUES ('ExponentPushToken[ann-owner]', $1, 'android'), ('ExponentPushToken[ann-follower]', NULL, 'android')", [ownerRow.user_id]);
  await client.query("INSERT INTO public.push_follows (token, kind, target_id) VALUES ('ExponentPushToken[ann-follower]', 'TOURNAMENT', $1)", [T3]);

  // Announcements: organizers post; everyone reads public ones; team ones only reach that team.
  await as('organizer@tourny.local');
  const all = (await call("SELECT public.post_announcement($1,'Welcome','Doors open at 8.') AS id", [T3]))[0].id;
  const mine = (await call("SELECT public.post_announcement($1,'Team talk','Captains meet at 9.',$2) AS id", [T3, team]))[0].id;
  await fails("SELECT public.post_announcement($1,'','x')", [T3], /title/);
  assert.equal((await call('SELECT * FROM public.get_announcements($1)', [T3])).length, 2, 'organizer sees both');
  await client.query('RESET ROLE');
  const queued = (await client.query("SELECT title, user_ids::text[] AS users, tokens FROM public.push_outbox WHERE title='Welcome'")).rows[0];
  assert.ok(queued, 'the announcement was queued as a push');
  assert.ok(queued.tokens.includes('ExponentPushToken[ann-follower]'), 'followers of the tournament are told');
  assert.ok(queued.users.includes(ownerRow.user_id), 'team owners are told');
  await as('organizer@tourny.local');
  await as(null);
  const publicView = await call('SELECT * FROM public.get_announcements($1)', [T3]);
  assert.deepEqual(publicView.map((a) => a.title), ['Welcome'], 'the public sees only the public announcement');
  await as('player@tourny.local');
  await fails("SELECT public.post_announcement($1,'Hack','nope')", [T3], /Unauthorized/);
  await as('organizer@tourny.local');
  await call('SELECT public.delete_announcement($1)', [all]);
  assert.equal((await call('SELECT * FROM public.get_announcements($1)', [T3])).length, 1);

  // Check-in: the team owner, the scorer or the organizer; not a stranger; not after the match started.
  await client.query('RESET ROLE');
  const owner = (await client.query('SELECT o.user_id, u.email FROM public.team_owners o JOIN auth.users u ON u.id=o.user_id WHERE o.team_id=$1 AND o.status=\'ACTIVE\' LIMIT 1', [match.h])).rows[0];
  await as(owner.email);
  await call('SELECT public.check_in_team($1,$2)', [match.id, match.h]);
  await fails('SELECT public.check_in_team($1,$2)', [match.id, match.a], /Unauthorized/);
  assert.equal((await call('SELECT * FROM public.get_match_checkins($1)', [match.id])).length, 1);
  await as('organizer@tourny.local');
  await call('SELECT public.check_in_team($1,$2)', [match.id, match.a]);
  assert.equal((await call('SELECT * FROM public.get_match_checkins($1)', [match.id])).length, 2);
  await call('SELECT public.undo_check_in($1,$2)', [match.id, match.a]);
  assert.equal((await call('SELECT * FROM public.get_match_checkins($1)', [match.id])).length, 1);
  await client.query('RESET ROLE');
  await client.query("UPDATE public.matches SET status='LIVE' WHERE id=$1", [match.id]);
  await as('organizer@tourny.local');
  await fails('SELECT public.check_in_team($1,$2)', [match.id, match.a], /before the match starts/);

  // Templates: settings, default format and colours come along; teams, players and fixtures do not.
  const src = (await client.query('SELECT count(*)::int c FROM public.teams WHERE tournament_id=$1', [T3])).rows[0].c;
  assert.ok(src > 0);
  const copy = (await call("SELECT public.duplicate_tournament($1,'Template Copy','template-copy') AS id", [T3]))[0].id;
  await client.query('RESET ROLE');
  const row = (await client.query('SELECT t.format, t.status, t.league_mode, s.min_squad_size, s.max_squad_size FROM public.tournaments t JOIN public.tournament_settings s ON s.tournament_id=t.id WHERE t.id=$1', [copy])).rows[0];
  const orig = (await client.query('SELECT t.format, t.league_mode, s.min_squad_size, s.max_squad_size FROM public.tournaments t JOIN public.tournament_settings s ON s.tournament_id=t.id WHERE t.id=$1', [T3])).rows[0];
  assert.equal(row.status, 'DRAFT');
  assert.deepEqual([row.format, row.league_mode, row.min_squad_size, row.max_squad_size], [orig.format, orig.league_mode, orig.min_squad_size, orig.max_squad_size]);
  assert.equal((await client.query('SELECT count(*)::int c FROM public.teams WHERE tournament_id=$1', [copy])).rows[0].c, 0);
  assert.equal((await client.query('SELECT count(*)::int c FROM public.matches WHERE tournament_id=$1', [copy])).rows[0].c, 0);
  const rules = async (id) => (await client.query('SELECT r.sets_to_win, array_agg(s.target_points ORDER BY s.set_number) t FROM public.volleyball_rules r LEFT JOIN public.volleyball_set_rules s ON s.volleyball_rule_id=r.id WHERE r.tournament_id=$1 GROUP BY r.id ORDER BY (r.stage_id IS NOT NULL), r.created_at LIMIT 1', [id])).rows[0];
  assert.deepEqual(await rules(copy), await rules(T3));
  await as('organizer@tourny.local');
  await fails("SELECT public.duplicate_tournament($1,'Again','template-copy')", [T3], /already used/);
  await as('player@tourny.local');
  await fails("SELECT public.duplicate_tournament($1,'Nope','nope-copy')", [T3], /Unauthorized/);
  console.log('Organizer tools: PASS (announcements, check-in, tournament template, permissions)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
