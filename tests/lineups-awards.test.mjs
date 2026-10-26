import assert from 'node:assert/strict';
import pg from 'pg';

// Lineups, substitutions, rotation counts and awards, run as real signed-in roles inside a transaction that is rolled back.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();
const T3 = '90200000-0000-0000-0000-000000000003';

const as = async (email) => {
  await client.query('RESET ROLE');
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

await client.query('BEGIN');
try {
  const pick = (await client.query(`
    SELECT m.id, m.home_team_id h, m.away_team_id a FROM public.matches m
    WHERE m.tournament_id=$1 AND m.status='SCHEDULED' AND m.home_team_id IS NOT NULL AND m.away_team_id IS NOT NULL
      AND (SELECT count(*) FROM public.team_players WHERE team_id=m.home_team_id AND status='ACTIVE') >= 7
      AND (SELECT count(*) FROM public.team_players WHERE team_id=m.away_team_id AND status='ACTIVE') >= 7
    ORDER BY m.program_order LIMIT 1`, [T3])).rows[0];
  if (!pick) { console.log('Lineups and awards: SKIPPED (seed has no match with two full squads)'); process.exit(0); }
  await client.query("UPDATE public.matches SET status='LIVE' WHERE id=$1", [pick.id]);
  // Give the home team a second bench player so a plain substitution is possible next to the libero.
  const extra = (await client.query("SELECT pp.id FROM public.player_profiles pp WHERE pp.id NOT IN (SELECT player_id FROM public.team_players) ORDER BY pp.display_name LIMIT 1")).rows[0];
  await client.query("INSERT INTO public.team_players (team_id, player_id, tournament_id, acquisition_type, status) VALUES ($1,$2,$3,'MANUAL','ACTIVE')", [pick.h, extra.id, T3]).catch(() => {});
  await as('organizer@tourny.local');
  const squads = (await call('SELECT public.get_match_squads($1) AS s', [pick.id]))[0].s;
  const home = squads.find((s) => s.team_id === pick.h).players.map((p) => p.id);
  const away = squads.find((s) => s.team_id === pick.a).players.map((p) => p.id);
  const bench = home.filter((id) => !home.slice(0, 7).includes(id));

  await call('SELECT public.set_match_setup($1,1,$2,$2)', [pick.id, pick.h]);
  await call('SELECT public.set_set_lineup($1,1,$2,$3::uuid[],$4)', [pick.id, pick.h, home.slice(0, 6), home[6]]);
  await call('SELECT public.set_set_lineup($1,1,$2,$3::uuid[],NULL)', [pick.id, pick.a, away.slice(0, 6)]);
  for (const team of [pick.h, pick.a, pick.a, pick.h]) await call('SELECT public.award_point($1,$2,$3)', [pick.id, team, `lineup-test-${Math.random()}`]);

  await fails('SELECT public.record_substitution($1,1,$2,$3,$4,$5)', [pick.id, pick.h, 'SUB', home[0], home[1]], /already on court/);
  await fails('SELECT public.record_substitution($1,1,$2,$3,$4,$5)', [pick.id, pick.h, 'SUB', bench[0] ?? home[6], home[1]], /not on court/);
  await fails('SELECT public.record_substitution($1,1,$2,$3,$4,$5)', [pick.id, pick.h, 'SUB', home[0], home[6]], /libero/);
  if (bench.length) {
    const r = (await call('SELECT public.record_substitution($1,1,$2,$3,$4,$5) AS r', [pick.id, pick.h, 'SUB', home[0], bench[0]]))[0].r;
    assert.equal(r.subs_used, 1);
  }
  await call('SELECT public.record_substitution($1,1,$2,$3,$4,$5)', [pick.id, pick.h, 'LIBERO_IN', home[2], home[6]]);
  await call('SELECT public.record_substitution($1,1,$2,$3,$4,$5)', [pick.id, pick.h, 'LIBERO_OUT', home[6], home[2]]);
  await call('SELECT public.undo_last_substitution($1,1,$2)', [pick.id, pick.h]);

  const view = (await call('SELECT public.get_match_lineups($1) AS v', [pick.id]))[0].v;
  assert.equal(view.lineups.length, 2);
  assert.equal(view.lineups.find((l) => l.team_id === pick.h).slots.length, 6);
  const rot = (team) => view.rotations.find((r) => r.team_id === team && r.set_number === 1)?.count ?? 0;
  assert.equal(rot(pick.h), 1, 'home won the serve back once');
  assert.equal(rot(pick.a), 1, 'away won the serve back once');
  assert.ok(view.substitutions.some((s) => s.kind === 'LIBERO_IN'));

  // Awards: not before the match is finished, then a player of the match.
  await fails('SELECT public.set_match_mvp($1,$2)', [pick.id, home[1]], /finished/);
  await client.query('RESET ROLE');
  await client.query("UPDATE public.matches SET status='COMPLETED' WHERE id=$1", [pick.id]);
  await as('organizer@tourny.local');
  await call('SELECT public.set_match_mvp($1,$2)', [pick.id, home[1]]);
  await fails('SELECT public.set_match_mvp($1,$2)', [pick.id, '00000000-0000-0000-0000-000000000000'], /not in either squad/);
  assert.equal((await call('SELECT public.get_match_lineups($1) AS v', [pick.id]))[0].v.mvp.id, home[1]);
  await call("SELECT public.set_tournament_award($1,'Best Server',$2,'Most aces')", [T3, home[1]]);
  assert.equal((await call('SELECT * FROM public.get_tournament_awards($1)', [T3])).length, 1);
  const mine = await call('SELECT * FROM public.get_player_awards($1)', [home[1]]);
  assert.ok(mine.some((a) => a.kind === 'MVP') && mine.some((a) => a.title === 'Best Server'));

  // Other people cannot hand out awards or touch lineups.
  await as('player@tourny.local');
  await fails('SELECT public.set_tournament_award($1,\'X\',$2,NULL)', [T3, home[1]], /Unauthorized/);
  await fails('SELECT public.set_set_lineup($1,2,$2,$3::uuid[],NULL)', [pick.id, pick.h, home.slice(0, 6)], /Unauthorized/);
  await fails('SELECT public.get_match_squads($1)', [pick.id], /Unauthorized/);
  await client.query('RESET ROLE');
  console.log('Lineups and awards: PASS (lineup, substitution rules, rotation counts, MVP, tournament awards, permissions)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
