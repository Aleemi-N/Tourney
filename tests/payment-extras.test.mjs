import assert from 'node:assert/strict';
import pg from 'pg';

// Payment alerts, reminders, receipts and screenshot proof. Rolled back at the end.
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
const raw = async (sql, args = []) => { await client.query('RESET ROLE'); return (await client.query(sql, args)).rows; };
const fails = async (sql, args, pattern) => {
  await client.query('SAVEPOINT s');
  try { await client.query(sql, args); } catch (e) { await client.query('ROLLBACK TO s'); assert.match(e.message, pattern); return; }
  await client.query('ROLLBACK TO s');
  assert.fail(`expected failure: ${pattern}`);
};
const outbox = async () => raw('SELECT id, user_ids, title, body, data FROM public.push_outbox ORDER BY id');

// A tiny valid-looking PNG and JPEG (only the signature bytes matter to the database).
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]).toString('base64');
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 2)]).toString('base64');

try {
  await client.query('BEGIN');
  const orgRow = (await client.query("SELECT u.id, u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0];
  const players = (await client.query("SELECT r.id, pp.user_id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' ORDER BY r.created_at LIMIT 2", [T1])).rows;
  const [p1, p2] = players;
  // Devices registered, so alerts are queued.
  for (const u of [orgRow.id, p1.user_id, p2.user_id]) await client.query("INSERT INTO public.push_tokens (token, user_id, platform) VALUES ($1, $2, 'android')", ['ExponentPushToken[' + u + ']', u]);
  await client.query('DELETE FROM public.push_outbox');

  await as(orgRow.email);
  await call('SELECT public.set_registration_fees($1, 250, 1500)', [T1]);
  await call("SELECT public.set_upi_details($1, 'ravi@okhdfc', 'Ravi Kumar')", [T1]);

  // --- Proof: only JPEG/PNG, size-limited, readable by the payer and organizers only.
  await as(p1.email);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001', $2)", [p1.id, Buffer.from('just text, not an image').toString('base64')], /JPEG or PNG/);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001', $2)", [p1.id, '%%%not base64%%%'], /could not be read/);
  await fails("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001', $2)", [p1.id, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1500001)]).toString('base64')], /too large/);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000001', $2)", [p1.id, 'data:image/png;base64,' + png]);
  const due = (await call('SELECT * FROM public.my_payments_due()')).find((d) => d.registration_id === p1.id);
  assert.equal(due.has_proof, true);
  const proof = (await call('SELECT public.get_payment_proof($1) AS p', [due.payment_id]))[0].p;
  assert.equal(proof, 'data:image/png;base64,' + png);
  await as(p2.email);
  await fails('SELECT public.get_payment_proof($1)', [due.payment_id], /Payment not found/);
  await as(null);
  await fails('SELECT public.get_payment_proof($1)', [due.payment_id], /permission denied|Payment not found/);
  await as(orgRow.email);
  assert.equal((await call('SELECT public.get_payment_proof($1) AS p', [due.payment_id]))[0].p, proof, 'organizer can see it');
  assert.equal((await call('SELECT * FROM public.list_registration_payments($1)', [T1])).find((r) => r.registration_id === p1.id).has_proof, true);
  // A resubmission without a new screenshot keeps the old one; a new one replaces it.
  await as(p1.email);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000003', NULL)", [p1.id]);
  assert.equal((await call('SELECT public.get_payment_proof($1) AS p', [due.payment_id]))[0].p, proof);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000003', $2)", [p1.id, jpg]);
  assert.ok((await call('SELECT public.get_payment_proof($1) AS p', [due.payment_id]))[0].p.startsWith('data:image/jpeg;base64,'));

  // --- Alerts: the organizer hears about the submission (and the changed reference), the payer about each decision.
  let box = await outbox();
  const toOrg = box.filter((b) => b.title === 'UPI payment to confirm');
  assert.equal(toOrg.length, 2, 'one alert per submission or changed reference, none for the same reference again');
  assert.deepEqual(toOrg[0].user_ids, [orgRow.id]); assert.equal(toOrg[0].data.kind, 'PAYMENT_SUBMITTED'); assert.equal(toOrg[0].data.tournamentId, T1);
  assert.match(toOrg[0].body, /paid ₹250/);
  await raw('DELETE FROM public.push_outbox');
  await as(orgRow.email);
  await call('SELECT public.review_upi_payment($1, false, NULL)', [due.payment_id]);
  box = await outbox();
  assert.equal(box.length, 1); assert.equal(box[0].title, 'Payment not received'); assert.deepEqual(box[0].user_ids, [p1.user_id]); assert.equal(box[0].data.kind, 'PAYMENT_REJECTED');
  await as(p1.email);
  await call("SELECT public.submit_upi_payment('PLAYER', $1, '402100000004', NULL)", [p1.id]);
  await raw('DELETE FROM public.push_outbox');
  await as(orgRow.email);
  await call('SELECT public.review_upi_payment($1, true, NULL)', [due.payment_id]);
  box = await outbox();
  assert.equal(box.length, 1); assert.equal(box[0].title, 'Payment confirmed'); assert.deepEqual(box[0].user_ids, [p1.user_id]); assert.equal(box[0].data.paymentId, due.payment_id);
  await raw('DELETE FROM public.push_outbox');
  await as(orgRow.email);
  await call("SELECT public.mark_registration_paid('PLAYER', $1, 'WAIVED', NULL)", [p2.id]);
  box = await outbox();
  assert.equal(box.length, 1); assert.equal(box[0].title, 'Fee waived'); assert.deepEqual(box[0].user_ids, [p2.user_id]);
  // An online (Razorpay) payment confirmed by the API tells both sides.
  await raw('DELETE FROM public.push_outbox');
  await raw("INSERT INTO public.registration_payments (tournament_id, kind, registration_id, payer_user_id, amount, status, provider) VALUES ($1,'PLAYER',gen_random_uuid(),$2,250,'CREATED','RAZORPAY')", [T1, p2.user_id]);
  await raw("UPDATE public.registration_payments SET status='PAID', paid_at=now() WHERE provider='RAZORPAY' AND payer_user_id=$1", [p2.user_id]);
  box = await outbox();
  assert.deepEqual(box.map((b) => b.title).sort(), ['Payment confirmed', 'Payment received']);

  // --- Receipts
  await as(p1.email);
  const receipt = (await call('SELECT public.get_payment_receipt($1) AS r', [due.payment_id]))[0].r;
  assert.match(receipt.receipt_no, /^TRN-[0-9A-F]{8}$/); assert.equal(Number(receipt.amount), 250); assert.equal(receipt.method, 'UPI');
  assert.equal(receipt.reference, '402100000004'); assert.equal(receipt.paid_to, 'Ravi Kumar'); assert.equal(receipt.kind, 'PLAYER');
  const mine = await call('SELECT * FROM public.my_payment_receipts()');
  assert.ok(mine.some((m) => m.payment_id === due.payment_id && m.status === 'PAID'));
  assert.ok(!mine.some((m) => m.method === 'Razorpay'), 'only my own receipts');
  await as(p2.email);
  await fails('SELECT public.get_payment_receipt($1)', [due.payment_id], /Receipt not found/);
  await as(orgRow.email);
  assert.equal((await call('SELECT public.get_payment_receipt($1) AS r', [due.payment_id]))[0].r.receipt_no, receipt.receipt_no, 'organizer can open it too');
  await as(null);
  await fails('SELECT public.get_payment_receipt($1)', [due.payment_id], /permission denied|Receipt not found/);
  // No receipt before it is paid.
  await raw("UPDATE public.registration_payments SET status='SUBMITTED' WHERE id=$1", [due.payment_id]);
  await as(p1.email);
  await fails('SELECT public.get_payment_receipt($1)', [due.payment_id], /no receipt/);
  await raw("UPDATE public.registration_payments SET status='PAID' WHERE id=$1", [due.payment_id]);

  // --- Reminders: only for registrations older than a day, up to 3 times, 3 days apart; not while a payment waits.
  await raw('DELETE FROM public.push_outbox');
  await raw('DELETE FROM public.registration_payments WHERE registration_id = ANY($1)', [[p2.id]]);
  await raw("UPDATE public.tournaments SET status='REGISTRATION' WHERE id=$1", [T1]);
  await raw("UPDATE public.player_tournament_registrations SET created_at = now() - interval '2 hours' WHERE id=$1", [p2.id]);
  assert.equal((await raw('SELECT public.send_payment_reminders() AS n'))[0].n, 0, 'too early');
  await raw("UPDATE public.player_tournament_registrations SET created_at = now() - interval '2 days' WHERE id=$1", [p2.id]);
  assert.equal((await raw('SELECT public.send_payment_reminders() AS n'))[0].n, 1);
  box = await outbox();
  const rem = box.find((b) => b.title === 'Registration fee still due');
  assert.deepEqual(rem.user_ids, [p2.user_id]); assert.equal(rem.data.kind, 'PAYMENT_DUE'); assert.match(rem.body, /₹250/);
  assert.equal((await raw('SELECT public.send_payment_reminders() AS n'))[0].n, 0, 'not again straight away');
  for (let i = 0; i < 4; i++) {
    await raw("UPDATE public.payment_reminders SET sent_at = now() - interval '4 days' WHERE kind='PLAYER' AND registration_id=$1", [p2.id]);
    await raw('SELECT public.send_payment_reminders()');
  }
  assert.equal((await raw("SELECT times FROM public.payment_reminders WHERE kind='PLAYER' AND registration_id=$1", [p2.id]))[0].times, 3, 'at most three reminders');
  // Organizer: UPI payments waiting more than 12 hours.
  await raw('DELETE FROM public.push_outbox');
  await raw("UPDATE public.registration_payments SET status='SUBMITTED', updated_at = now() - interval '13 hours' WHERE id=$1", [due.payment_id]);
  const sent = (await raw('SELECT public.send_payment_reminders() AS n'))[0].n;
  assert.ok(sent >= 1);
  box = await outbox();
  const waiting = box.find((b) => b.title === 'Payments waiting for you');
  assert.ok(waiting, 'organizer reminded'); assert.deepEqual(waiting.user_ids, [orgRow.id]); assert.match(waiting.body, /1 UPI payment is waiting/);
  await raw('DELETE FROM public.push_outbox');
  assert.ok(!(await outbox()).some((b) => b.title === 'Payments waiting for you'), 'once a day');
  await raw('SELECT public.send_payment_reminders()');
  assert.ok(!(await outbox()).some((b) => b.title === 'Payments waiting for you'), 'not reminded again within a day');
  // Nobody but the server can run it.
  await as(orgRow.email);
  await fails('SELECT public.send_payment_reminders()', [], /permission denied/);

  console.log('Payment extras: PASS (screenshot proof, alerts, receipts, reminders)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
