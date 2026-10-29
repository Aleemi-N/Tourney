import assert from 'node:assert/strict';
import pg from 'pg';

// Paying a registration fee straight to the organizer's UPI ID: player and team registrations, the reference number,
// confirm / reject, duplicates, hand-made refunds and who may do what. Rolled back at the end.
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
const call = async (sql, args = []) => (await client.query(sql, args)).rows;
const fails = async (sql, args, pattern) => {
  await client.query('SAVEPOINT s');
  try { await client.query(sql, args); } catch (e) { await client.query('ROLLBACK TO s'); assert.match(e.message, pattern); return; }
  await client.query('ROLLBACK TO s');
  assert.fail(`expected failure: ${pattern}`);
};
const raw = async (sql, args = []) => { await client.query('RESET ROLE'); return (await client.query(sql, args)).rows; };

try {
  await client.query('BEGIN');
  const org = (await client.query("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].email;
  const players = (await client.query("SELECT r.id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' ORDER BY r.created_at LIMIT 2", [T1])).rows;
  const teams = (await client.query("SELECT a.id, u.email FROM public.team_owner_applications a JOIN auth.users u ON u.id=a.user_id WHERE a.tournament_id=$1 AND a.status='PENDING' ORDER BY a.created_at LIMIT 2", [T1])).rows;
  assert.ok(players.length === 2 && teams.length >= 1, 'seed has pending player and team registrations');
  const [p1, p2] = players;
  const team = teams[0];

  // Only an organizer sets the UPI ID, and it must look like one.
  await as(p1.email);
  await fails("SELECT public.set_upi_details($1, 'x@okhdfc', 'X')", [T1], /Unauthorized/);
  await as(org);
  await fails("SELECT public.set_upi_details($1, 'not a upi id', 'X')", [T1], /does not look like a UPI ID/);
  await call("SELECT public.set_registration_fees($1, 250, 1500)", [T1]);
  await call("SELECT public.set_upi_details($1, 'ravi@okhdfc', 'Ravi Kumar')", [T1]);
  const f = (await call('SELECT public.get_registration_fees($1) AS f', [T1]))[0].f;
  assert.equal(f.upi, true); assert.equal(f.upi_id, 'ravi@okhdfc'); assert.equal(f.upi_payee, 'Ravi Kumar');
  // The UPI ID is not handed out by the public fee call; payers get it with their own dues.
  await as(null);
  const pub = (await call('SELECT public.get_registration_fees($1) AS f', [T1]))[0]?.f;
  if (pub) { assert.equal(pub.upi, true); assert.equal(pub.upi_id, undefined); }

  // The player sees what to pay and where.
  await as(p1.email);
  const due = (await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === p1.id);
  assert.equal(due.status, 'DUE'); assert.equal(Number(due.amount), 250); assert.equal(due.upi_id, 'ravi@okhdfc'); assert.equal(due.upi_payee, 'Ravi Kumar');

  // The reference number is checked; nobody else can claim for this registration.
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '12345')", [p1.id], /12 digits/);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, 'abcdefghijkl')", [p1.id], /12 digits/);
  await as(p2.email);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001')", [p1.id], /Registration not found/);
  await as(null);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001')", [p1.id], /permission denied|Sign in/);

  // Player reports the payment (spaces are tolerated); it waits for the organizer and does not unlock approval.
  await as(p1.email);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '4021 0000 0001')", [p1.id]);
  assert.equal((await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === p1.id).status, 'SUBMITTED');
  assert.equal((await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === p1.id).utr, '402100000001');
  await as(org);
  await fails("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p1.id], /fee has not been paid/);
  const listed = (await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === p1.id);
  assert.equal(listed.status, 'SUBMITTED'); assert.equal(listed.provider, 'UPI'); assert.equal(listed.utr, '402100000001');

  // The same reference cannot back a second claim.
  await as(p2.email);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001')", [p2.id], /already been used/);

  // The payer cannot confirm their own payment; the organizer rejects, the payer corrects and resubmits.
  await as(p1.email);
  await fails('SELECT public.review_upi_payment($1, true, NULL)', [listed.payment_id], /Unauthorized/);
  await as(org);
  await call("SELECT public.review_upi_payment($1, false, 'Amount was only 200')", [listed.payment_id]);
  await as(p1.email);
  const rejected = (await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === p1.id);
  assert.equal(rejected.status, 'REJECTED'); assert.equal(rejected.note, 'Amount was only 200');
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000002')", [p1.id]);
  await as(org);
  const again = (await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === p1.id);
  assert.equal(again.status, 'SUBMITTED'); assert.equal(again.utr, '402100000002'); assert.equal(again.payment_id, listed.payment_id, 'the same claim is reused');
  // The rejected reference is free again.
  await as(p2.email);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001')", [p2.id]);

  // Confirmed: it is paid, can be approved, and a confirmed one cannot be reviewed twice.
  await as(org);
  await call('SELECT public.review_upi_payment($1, true, NULL)', [again.payment_id]);
  await fails('SELECT public.review_upi_payment($1, true, NULL)', [again.payment_id], /not waiting for confirmation/);
  await call("SELECT public.approve_player_registration($1, 'ICON_LOT', NULL)", [p1.id]);
  assert.equal((await raw('SELECT status FROM public.player_tournament_registrations WHERE id=$1', [p1.id]))[0].status, 'APPROVED');
  await as(p1.email);
  assert.ok(!(await call('SELECT * FROM public.my_payments_due()')).some((d) => d.registration_id === p1.id));

  // A refund the organizer sent by hand is recorded, in part and then in full.
  await as(org);
  await fails('SELECT public.record_manual_refund($1, 500, NULL)', [again.payment_id], /cannot be more/);
  await call("SELECT public.record_manual_refund($1, 100, 'sent by UPI')", [again.payment_id]);
  let row = (await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === p1.id);
  assert.equal(row.status, 'PARTIALLY_REFUNDED'); assert.equal(Number(row.refunded_amount), 100);
  await call('SELECT public.record_manual_refund($1, NULL, NULL)', [again.payment_id]);
  row = (await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === p1.id);
  assert.equal(row.status, 'REFUNDED'); assert.equal(Number(row.refunded_amount), 250);

  // Marking paid by hand closes a claim that was waiting.
  await call("SELECT public.mark_registration_paid('PLAYER', $1, 'PAID', 'cash instead')", [p2.id]);
  const closed = (await raw("SELECT status FROM public.registration_payments WHERE registration_id=$1 AND provider='UPI'", [p2.id]))[0];
  assert.equal(closed.status, 'CANCELLED');

  // Team registrations work the same way, with the team fee.
  await as(team.email);
  const tdue = (await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === team.id);
  assert.equal(tdue.kind, 'TEAM'); assert.equal(Number(tdue.amount), 1500); assert.equal(tdue.upi_id, 'ravi@okhdfc');
  await call("SELECT public.submit_upi_payment('TEAM', $1, '502200000001')", [team.id]);
  await as(org);
  await fails('SELECT public.approve_team_owner_application($1, NULL)', [team.id], /fee has not been paid/);
  const tl = (await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === team.id);
  assert.equal(tl.kind, 'TEAM'); assert.equal(tl.status, 'SUBMITTED'); assert.equal(Number(tl.amount), 1500);
  await call('SELECT public.review_upi_payment($1, true, NULL)', [tl.payment_id]);
  await call('SELECT public.approve_team_owner_application($1, NULL)', [team.id]);
  assert.equal((await raw('SELECT status FROM public.team_owner_applications WHERE id=$1', [team.id]))[0].status, 'APPROVED');

  // Without a UPI ID there is nothing to pay to; clearing it removes it from the public flag.
  const team2 = teams[1];
  await as(org);
  await call("SELECT public.set_upi_details($1, '', NULL)", [T1]);
  assert.equal((await call('SELECT public.get_registration_fees($1) AS f', [T1]))[0].f.upi, false);
  if (team2) { await as(team2.email); await fails("SELECT public.submit_upi_payment('TEAM', $1, '502200000002')", [team2.id], /not set a UPI ID/); }

  // The payment records stay unreadable through the normal data access.
  await client.query('RESET ROLE');
  assert.equal((await client.query("SELECT has_table_privilege('authenticated','public.registration_payments','SELECT') a")).rows[0].a, false);
  console.log('UPI payments: PASS (player + team, reference checks, duplicates, confirm/reject/resubmit, refunds, permissions)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
