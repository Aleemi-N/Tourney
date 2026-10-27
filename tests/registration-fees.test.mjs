import assert from 'node:assert/strict';
import pg from 'pg';

// Registration fees: the approval rule, offline payment, waiving, and who may see or change what. Rolled back at the end.
const client = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();
const T1 = '90200000-0000-0000-0000-000000000001';

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
  const org = (await client.query("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].email;
  const pending = (await client.query("SELECT r.id, pp.user_id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' ORDER BY r.created_at LIMIT 2", [T1])).rows;
  assert.ok(pending.length >= 1, 'seed has a pending player registration');
  const reg = pending[0];

  // Fees can only be set by an organizer, and stay within sensible bounds.
  await as(null);
  await fails('SELECT public.set_registration_fees($1, 100, 0)', [T1], /permission denied|Unauthorized/);
  await as(reg.email);
  await fails('SELECT public.set_registration_fees($1, 100, 0)', [T1], /Unauthorized/);
  await as(org);
  await fails('SELECT public.set_registration_fees($1, -1, 0)', [T1], /between 0 and/);
  await call('SELECT public.set_registration_fees($1, 250.5, 1500)', [T1]);
  const fees = (await call('SELECT public.get_registration_fees($1) AS f', [T1]))[0].f;
  assert.equal(Number(fees.player_fee), 250.5); assert.equal(Number(fees.team_fee), 1500); assert.equal(fees.online, false);

  // The player sees what they owe; another player does not see it.
  await as(reg.email);
  const due = await call('SELECT * FROM public.my_payments_due()');
  assert.ok(due.some((d) => d.registration_id === reg.id && Number(d.amount) === 250.5 && d.status === 'DUE'));
  if (pending[1]) { await as(pending[1].email); assert.ok(!(await call('SELECT * FROM public.my_payments_due()')).some((d) => d.registration_id === reg.id), 'someone else does not see it'); }

  // Not payable by approval until settled.
  await as(org);
  await client.query('SAVEPOINT a');
  await fails("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [reg.id], /fee has not been paid/);
  // The player cannot mark themselves paid.
  await as(reg.email);
  await fails("SELECT public.mark_registration_paid('PLAYER', $1, 'PAID', 'trust me')", [reg.id], /Unauthorized/);
  await as(null);
  await fails("SELECT public.mark_registration_paid('PLAYER', $1, 'PAID', NULL)", [reg.id], /permission denied|Unauthorized/);

  // The organizer took cash: now it can be approved, and the list shows it.
  await as(org);
  await call("SELECT public.mark_registration_paid('PLAYER', $1, 'PAID', 'cash at the desk')", [reg.id]);
  const list = await call('SELECT * FROM public.list_registration_payments($1)', [T1]);
  const row = list.find((r) => r.registration_id === reg.id);
  assert.equal(row.status, 'PAID'); assert.equal(row.provider, 'MANUAL'); assert.equal(Number(row.amount), 250.5);
  await call("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [reg.id]);
  assert.equal((await client.query('RESET ROLE').then(() => client.query('SELECT status FROM public.player_tournament_registrations WHERE id=$1', [reg.id]))).rows[0].status, 'APPROVED');
  await as(reg.email);
  assert.ok(!(await call('SELECT * FROM public.my_payments_due()')).some((d) => d.registration_id === reg.id), 'nothing left to pay');

  // A waiver also settles it; a free tournament never blocks.
  if (pending[1]) {
    await as(org);
    await call("SELECT public.mark_registration_paid('PLAYER', $1, 'WAIVED', 'volunteer')", [pending[1].id]);
    await call("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [pending[1].id]);
  }
  await as(org);
  await call('SELECT public.set_registration_fees($1, 0, 0)', [T1]);
  assert.equal(Number((await call('SELECT public.get_registration_fees($1) AS f', [T1]))[0].f.player_fee), 0);

  // The payment records and keys are not readable through the normal data access.
  await client.query('RESET ROLE');
  const priv = (await client.query("SELECT has_table_privilege('authenticated','public.registration_payments','SELECT') a, has_table_privilege('authenticated','public.tournament_payment_accounts','SELECT') b, has_table_privilege('anon','public.tournament_payment_accounts','SELECT') c")).rows[0];
  assert.deepEqual(priv, { a: false, b: false, c: false });
  console.log('Registration fees: PASS (fee rules, approval block, offline payment, waiver, visibility, permissions)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
