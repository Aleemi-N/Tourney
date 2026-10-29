import assert from 'node:assert/strict';
import pg from 'pg';

// Registration deadline, player limit with waitlist, and age category. Rolled back at the end.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5440/tourny' });
await client.connect();
const T1 = '90200000-0000-0000-0000-000000000001';

const as = async (email) => {
  await client.query('RESET ROLE');
  if (!email) { await client.query("SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)"); await client.query('SET LOCAL ROLE anon'); return; }
  const { rows } = await client.query('SELECT id FROM auth.users WHERE email=$1', [email]);
  await client.query("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: rows[0].id, role: 'authenticated' }), rows[0].id]);
  await client.query('SET LOCAL ROLE authenticated');
};
const server = async () => { await client.query('RESET ROLE'); await client.query("SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)"); };
const call = async (sql, args = []) => (await client.query(sql, args)).rows;
const raw = async (sql, args = []) => { await client.query('RESET ROLE'); return (await client.query(sql, args)).rows; };
const fails = async (sql, args, pattern) => {
  await client.query('SAVEPOINT s');
  try { await client.query(sql, args); } catch (e) { await client.query('ROLLBACK TO s'); assert.match(e.message, pattern); return; }
  await client.query('ROLLBACK TO s');
  assert.fail(`expected failure: ${pattern}`);
};
const positions = async () => (await raw("SELECT id, waitlist_position FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status IN ('PENDING','CHANGES_REQUESTED') ORDER BY created_at, id", [T1]));

try {
  await client.query('BEGIN');
  const org = (await client.query("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].email;
  const pendingUser = (await client.query("SELECT u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' LIMIT 1", [T1])).rows[0].email;
  const approved = Number((await raw("SELECT count(*) n FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status='APPROVED'", [T1]))[0].n);
  const pending = (await positions());
  assert.ok(pending.length >= 5, 'seed has pending registrations');
  await raw("UPDATE public.tournaments SET status='REGISTRATION' WHERE id=$1", [T1]);

  // Only an organizer changes the limits; they are validated.
  await as(pendingUser);
  await fails('SELECT public.set_registration_limits($1, NULL, 3, NULL, NULL)', [T1], /Unauthorized/);
  await as(org);
  await fails('SELECT public.set_registration_limits($1, NULL, 0, NULL, NULL)', [T1], /at least 1/);
  await fails('SELECT public.set_registration_limits($1, NULL, $2, NULL, NULL)', [T1, approved - 1], /already approved/);
  await fails("SELECT public.set_registration_limits($1, NULL, NULL, '2010-01-01', '2005-01-01')", [T1], /must not be later/);

  // A full tournament: everyone pending is on the waitlist, in order.
  await call('SELECT public.set_registration_limits($1, NULL, $2, NULL, NULL)', [T1, approved]);
  let p = await positions();
  assert.deepEqual(p.map((x) => x.waitlist_position), p.map((_, i) => i + 1), 'waitlist 1..n in registration order');
  let st = (await call('SELECT public.get_registration_status($1) AS s', [T1]))[0].s;
  assert.equal(st.player_spots_left, 0); assert.equal(st.waitlist, p.length); assert.equal(st.open, true);
  await fails("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p[0].id], /tournament is full/);

  // Someone on the waitlist is not asked to pay (and cannot submit a payment) until they have a place.
  await as(org);
  await call("SELECT public.set_registration_fees($1, 250, 0)", [T1]);
  await call("SELECT public.set_upi_details($1, 'ravi@okhdfc', 'Ravi')", [T1]);
  const waiting = (await raw("SELECT r.id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.id=$1", [p[0].id]))[0];
  await as(waiting.email);
  assert.ok(!(await call('SELECT * FROM public.my_payments_due()')).some((d) => d.registration_id === waiting.id), 'a waitlisted player owes nothing yet');
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001')", [waiting.id], /on the waitlist/);
  await as(org);
  // Raising the limit moves people off the waitlist; approving one moves the rest up.
  await call('SELECT public.set_registration_limits($1, NULL, $2, NULL, NULL)', [T1, approved + 2]);
  p = await positions();
  assert.deepEqual(p.slice(0, 2).map((x) => x.waitlist_position), [null, null]);
  await as(waiting.email);
  assert.ok((await call('SELECT * FROM public.my_payments_due()')).some((d) => d.registration_id === waiting.id), 'with a place they are asked to pay');
  await as(org);
  await call('SELECT public.set_registration_fees($1, 0, 0)', [T1]);
  assert.deepEqual(p.slice(2).map((x) => x.waitlist_position), p.slice(2).map((_, i) => i + 1));
  await call("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p[0].id]);
  p = await positions();
  assert.equal(p[0].waitlist_position, null, 'one place is left for the next in line'); assert.equal(p[1].waitlist_position, 1);
  await call("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p[0].id]);
  p = await positions();
  assert.deepEqual(p.map((x) => x.waitlist_position), p.map((_, i) => i + 1), 'now full again');
  await fails("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p[0].id], /tournament is full/);
  // Withdrawing a pending person moves the others up; no limit means no waitlist.
  await raw("UPDATE public.player_tournament_registrations SET status='WITHDRAWN' WHERE id=$1", [p[0].id]);
  p = await positions();
  assert.deepEqual(p.map((x) => x.waitlist_position), p.map((_, i) => i + 1));
  await as(org);
  await call('SELECT public.set_registration_limits($1, NULL, NULL, NULL, NULL)', [T1]);
  assert.ok((await positions()).every((x) => x.waitlist_position === null), 'no limit, no waitlist');

  // Deadline: after it, a player cannot register (and a team cannot apply); the organizer still can.
  const free = (await raw("SELECT pp.id, pp.user_id, u.email FROM public.player_profiles pp JOIN auth.users u ON u.id=pp.user_id WHERE pp.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.player_tournament_registrations r WHERE r.player_id=pp.id AND r.tournament_id=$1) LIMIT 3", [T1]));
  assert.ok(free.length >= 3);
  await as(org);
  await call("SELECT public.set_registration_limits($1, now() - interval '1 hour', NULL, NULL, NULL)", [T1]);
  assert.equal((await call('SELECT public.get_registration_status($1) AS s', [T1]))[0].s.open, false);
  await server();
  await fails("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[0].id], /has closed/);
  await as(org);
  await client.query('RESET ROLE'); // still signed in as the organizer, but with the server's table access
  await client.query("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[0].id]);
  await as(org);
  await call("SELECT public.set_registration_limits($1, now() + interval '1 day', NULL, NULL, NULL)", [T1]);
  assert.equal((await call('SELECT public.get_registration_status($1) AS s', [T1]))[0].s.open, true);

  // Age category: born on or after 1 Jan 2005. Too old, no date of birth, and fine.
  await call("SELECT public.set_registration_limits($1, NULL, NULL, '2005-01-01', '2010-12-31')", [T1]);
  await raw("UPDATE public.player_profiles SET date_of_birth='1999-05-05' WHERE id=$1", [free[1].id]);
  await raw('UPDATE public.player_profiles SET date_of_birth=NULL WHERE id=$1', [free[2].id]);
  await raw("UPDATE public.player_profiles SET date_of_birth='2007-03-03' WHERE id=$1", [free[0].id]);
  await raw('DELETE FROM public.player_tournament_registrations WHERE player_id=$1 AND tournament_id=$2', [free[0].id, T1]);
  await server();
  await fails("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[1].id], /born on or after 01 Jan 2005/);
  await fails("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[2].id], /date of birth is needed/);
  await raw("UPDATE public.player_profiles SET date_of_birth='2012-01-01' WHERE id=$1", [free[1].id]);
  await fails("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[1].id], /born on or before 31 Dec 2010/);
  await client.query("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[0].id]);
  st = (await raw('SELECT public.get_registration_status($1) AS s', [T1]))[0].s;
  assert.equal(st.born_on_or_after, '2005-01-01'); assert.equal(st.born_on_or_before, '2010-12-31');
  // The organizer can still add someone outside the category.
  await as(org);
  await client.query('RESET ROLE');
  await client.query("INSERT INTO public.player_tournament_registrations (tournament_id, player_id, status) VALUES ($1, $2, 'PENDING')", [T1, free[1].id]);

  console.log('Registration limits: PASS (deadline, player limit and waitlist order, approval block, age category, organizer override)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
