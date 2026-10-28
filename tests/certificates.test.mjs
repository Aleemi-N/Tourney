import assert from 'node:assert/strict';
import pg from 'pg';

// Certificates: who gets which, and who can see them. Rolled back at the end.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();

const as = async (email) => {
  await client.query('RESET ROLE');
  if (!email) { await client.query("SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)"); await client.query('SET LOCAL ROLE anon'); return; }
  const { rows } = await client.query('SELECT id FROM auth.users WHERE email=$1', [email]);
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: rows[0].id, role: 'authenticated' }), rows[0].id]);
  await client.query('SET LOCAL ROLE authenticated');
};
const call = async (sql, args = []) => (await client.query(sql, args)).rows;
const raw = async (sql, args = []) => { await client.query('RESET ROLE'); return (await client.query(sql, args)).rows; };

try {
  await client.query('BEGIN');
  const T = (await raw("SELECT id, slug FROM public.tournaments WHERE name='Monsoon Cup 2025'"))[0]; // completed league
  const stage = (await raw('SELECT id FROM public.tournament_stages WHERE tournament_id=$1 ORDER BY sequence DESC LIMIT 1', [T.id]))[0];
  const top = await raw(`SELECT team_id FROM public.standings WHERE stage_id=$1 AND played>0 ORDER BY league_points DESC, (sets_won-sets_lost) DESC, (points_for-points_against) DESC, team_id LIMIT 2`, [stage.id]);
  assert.equal(top.length, 2, 'a completed league with a table');
  const champTeam = (await raw('SELECT name FROM public.teams WHERE id=$1', [top[0].team_id]))[0].name;
  const runnerTeam = (await raw('SELECT name FROM public.teams WHERE id=$1', [top[1].team_id]))[0].name;
  const org = (await raw("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T.id]))[0]?.email;

  // An award and a player of the match are added by the organizer's records.
  const someone = (await raw("SELECT tp.player_id, pp.display_name, pp.user_id FROM public.team_players tp JOIN public.player_profiles pp ON pp.id=tp.player_id WHERE tp.tournament_id=$1 AND tp.status='ACTIVE' AND pp.user_id IS NOT NULL LIMIT 1", [T.id]))[0];
  await raw("INSERT INTO public.tournament_awards (tournament_id, name, player_id, note) VALUES ($1, 'Best Server', $2, 'Most aces')", [T.id, someone.player_id]);
  const match = (await raw("SELECT id FROM public.matches WHERE tournament_id=$1 AND status='COMPLETED' LIMIT 1", [T.id]))[0];
  await raw('INSERT INTO public.match_awards (match_id, mvp_player_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [match.id, someone.player_id]);

  // Anyone can see a finished public tournament's certificates.
  await as(null);
  const all = await call('SELECT * FROM public.get_certificates($1)', [T.id]);
  const kinds = (k) => all.filter((c) => c.kind === k);
  assert.ok(kinds('CHAMPION').length > 0 && kinds('CHAMPION').every((c) => c.team_name === champTeam && c.title === 'Champions'));
  assert.ok(kinds('RUNNER_UP').length > 0 && kinds('RUNNER_UP').every((c) => c.team_name === runnerTeam));
  assert.equal(kinds('AWARD')[0].title, 'Best Server'); assert.equal(kinds('AWARD')[0].detail, 'Most aces');
  assert.equal(kinds('MVP')[0].recipient, someone.display_name); assert.match(kinds('MVP')[0].detail, / vs /);
  const approved = Number((await raw("SELECT count(*) n FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status='APPROVED'", [T.id]))[0].n);
  assert.equal(kinds('PARTICIPANT').length, approved);
  assert.ok(all.every((c) => c.tournament_slug === T.slug && c.tournament_name === 'Monsoon Cup 2025'));
  assert.equal(new Set(all.map((c) => c.cert_key)).size, all.length, 'keys are unique');
  const one = await call('SELECT * FROM public.get_certificate($1, $2)', [T.id, kinds('AWARD')[0].cert_key]);
  assert.equal(one.length, 1); assert.equal(one[0].recipient, someone.display_name);
  assert.equal((await call("SELECT * FROM public.get_certificate($1, 'AWARD:nope')", [T.id])).length, 0);

  // A tournament that is still running gives the public nothing; its organizer can preview (without a podium).
  const live = (await raw("SELECT id FROM public.tournaments WHERE name='Harbour Premier League'"))[0];
  await as(null);
  assert.equal((await call('SELECT * FROM public.get_certificates($1)', [live.id])).length, 0);
  const liveOrg = (await raw("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [live.id]))[0].email;
  await as(liveOrg);
  const preview = await call('SELECT * FROM public.get_certificates($1)', [live.id]);
  assert.ok(preview.length > 0 && preview.every((c) => c.kind !== 'CHAMPION' && c.kind !== 'RUNNER_UP'));

  // A player sees their own certificates, and only those.
  await as((await raw('SELECT email FROM auth.users WHERE id=$1', [someone.user_id]))[0].email);
  const mine = await call('SELECT * FROM public.my_certificates()');
  assert.ok(mine.length >= 2 && mine.some((c) => c.kind === 'AWARD') && mine.every((c) => c.recipient === someone.display_name));
  await as(null);
  await client.query('SAVEPOINT s');
  const anon = await client.query('SELECT * FROM public.my_certificates()').catch((e) => e);
  await client.query('ROLLBACK TO s');
  assert.match(String(anon.message), /permission denied/);

  // A knockout final decides the champion by its winner.
  await as(null);
  await raw("UPDATE public.tournament_stages SET stage_type='KNOCKOUT' WHERE id=$1", [stage.id]);
  const final = (await raw("SELECT id, home_team_id, away_team_id, winner_team_id FROM public.matches WHERE stage_id=$1 AND status='COMPLETED' AND winner_team_id IS NOT NULL ORDER BY round_number DESC NULLS LAST, match_number DESC LIMIT 1", [stage.id]))[0];
  const winnerName = (await raw('SELECT name FROM public.teams WHERE id=$1', [final.winner_team_id]))[0].name;
  await as(null);
  const ko = await call("SELECT * FROM public.get_certificates($1) WHERE kind='CHAMPION'", [T.id]);
  assert.ok(ko.length > 0 && ko.every((c) => c.team_name === winnerName), 'the final decides it');
  void org;
  console.log('Certificates: PASS (champions, runners-up, awards, player of the match, participation, visibility, own certificates)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
