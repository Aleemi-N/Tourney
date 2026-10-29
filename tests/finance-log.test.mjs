import assert from 'node:assert/strict';
import pg from 'pg';

// The organizers' income and expense log. Rolled back at the end.
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
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]).toString('base64');
const summary = async () => (await call('SELECT public.get_finance_summary($1) AS s', [T1]))[0].s;

try {
  await client.query('BEGIN');
  const org = (await client.query("SELECT u.email FROM public.tournament_members m JOIN auth.users u ON u.id=m.user_id WHERE m.tournament_id=$1 AND m.role='ORGANIZER' AND m.status='ACTIVE' LIMIT 1", [T1])).rows[0].email;
  const regs = (await client.query("SELECT r.id, u.email FROM public.player_tournament_registrations r JOIN public.player_profiles pp ON pp.id=r.player_id JOIN auth.users u ON u.id=pp.user_id WHERE r.tournament_id=$1 AND r.status='PENDING' ORDER BY r.created_at LIMIT 2", [T1])).rows;

  // Only organizers can see or write.
  await as(regs[0].email);
  await fails("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Venue', 1000, current_date)", [T1], /Unauthorized/);
  await fails('SELECT * FROM public.get_finance_ledger($1)', [T1], /Unauthorized/);
  await fails('SELECT public.get_finance_summary($1)', [T1], /Unauthorized/);
  await as(null);
  await fails('SELECT public.get_finance_summary($1)', [T1], /permission denied|Unauthorized/);

  await as(org);
  await fails("SELECT public.save_finance_entry($1, NULL, 'OTHER', 'Venue', 1000, current_date)", [T1], /income or expense/);
  await fails("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', '', 1000, current_date)", [T1], /category/);
  await fails("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Venue', 0, current_date)", [T1], /above zero/);
  await fails("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Venue', 10, NULL)", [T1], /date/);
  await fails("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Venue', 10, current_date, 'x', 'y', $2)", [T1, Buffer.from('not an image').toString('base64')], /JPEG or PNG/);

  const venue = (await call("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Venue', 5000, '2026-10-20', 'Hall hire, 2 days', 'City Sports Hall', $2) AS id", [T1, 'data:image/png;base64,' + png]))[0].id;
  const sponsor = (await call("SELECT public.save_finance_entry($1, NULL, 'INCOME', 'Sponsorship', 12000, '2026-10-18', 'Title sponsor', 'Acme Pvt Ltd') AS id", [T1]))[0].id;
  const refs = (await call("SELECT public.save_finance_entry($1, NULL, 'EXPENSE', 'Referees', 3000.50, '2026-10-21') AS id", [T1]))[0].id;

  // Fees that were paid, and a refund, appear on their own.
  await call('SELECT public.set_registration_fees($1, 250, 0)', [T1]);
  await call("SELECT public.mark_registration_paid('PLAYER', $1, 'PAID', NULL)", [regs[0].id]);
  await call("SELECT public.mark_registration_paid('PLAYER', $1, 'WAIVED', NULL)", [regs[1].id]); // a waiver is no income
  const pay = (await call("SELECT payment_id FROM public.list_registration_payments($1) WHERE registration_id=$2", [T1, regs[0].id]))[0].payment_id;
  await call("SELECT public.record_manual_refund($1, 30, NULL)", [pay]);
  await call("SELECT public.record_manual_refund($1, 20, NULL)", [pay]);

  let s = await summary();
  assert.equal(Number(s.fees_collected), 250, 'only the paid fee, not the waived one');
  assert.equal(Number(s.refunds), 50);
  assert.equal(Number(s.income), 12250);
  assert.equal(Number(s.expense), 5000 + 3000.5 + 50);
  assert.equal(Number(s.net), 12250 - 8050.5);
  const cat = (k, c) => Number(s.by_category.find((x) => x.kind === k && x.category === c)?.total ?? 0);
  assert.equal(cat('INCOME', 'Registration fees'), 250); assert.equal(cat('EXPENSE', 'Refunds'), 50); assert.equal(cat('EXPENSE', 'Venue'), 5000);

  let ledger = await call('SELECT * FROM public.get_finance_ledger($1)', [T1]);
  assert.deepEqual(ledger.map((l) => l.source).sort(), ['ENTRY', 'ENTRY', 'ENTRY', 'FEE', 'REFUND', 'REFUND'], 'each refund is its own line');
  // A later change to the payment does not move an earlier refund's date.
  const refundDates = (await call("SELECT occurred_on FROM public.get_finance_ledger($1) WHERE source='REFUND'", [T1])).map((r) => String(r.occurred_on));
  await raw("UPDATE public.registration_payments SET updated_at = now() + interval '40 days', note = 'touched' WHERE id=$1", [pay]);
  await as(org);
  assert.deepEqual((await call("SELECT occurred_on FROM public.get_finance_ledger($1) WHERE source='REFUND'", [T1])).map((r) => String(r.occurred_on)), refundDates);
  assert.ok(ledger.find((l) => l.source === 'FEE').description.startsWith('Registration fee: '));
  assert.equal(ledger.find((l) => l.id === venue).has_attachment, true);
  assert.equal(ledger.find((l) => l.id === refs).has_attachment, false);
  for (let i = 1; i < ledger.length; i++) assert.ok(ledger[i - 1].occurred_on >= ledger[i].occurred_on, 'newest first');

  // The bill photo is readable by organizers only.
  assert.equal((await call('SELECT public.get_finance_attachment($1) AS a', [venue]))[0].a, 'data:image/png;base64,' + png);
  await as(regs[0].email);
  await fails('SELECT public.get_finance_attachment($1)', [venue], /Entry not found/);
  await as(org);

  // Edit: the amount changes, the photo stays unless removed, and the change is logged with before and after.
  await call("SELECT public.save_finance_entry($1, $2, 'EXPENSE', 'Venue', 5500, '2026-10-20', 'Hall hire, 2 days + lights', 'City Sports Hall')", [T1, venue]);
  assert.equal((await call('SELECT public.get_finance_attachment($1) AS a', [venue]))[0].a, 'data:image/png;base64,' + png);
  await call("SELECT public.save_finance_entry($1, $2, 'EXPENSE', 'Venue', 5500, '2026-10-20', NULL, NULL, NULL, true)", [T1, venue]);
  assert.equal((await call('SELECT public.get_finance_attachment($1) AS a', [venue]))[0].a, null);
  const edits = await raw("SELECT before_json, after_json FROM public.audit_logs WHERE entity_id=$1 AND action='FINANCE_ENTRY_EDITED' ORDER BY created_at", [venue]);
  assert.equal(edits.length, 2); // both rows share one transaction timestamp, so look for the change rather than relying on their order
  assert.ok(edits.some((e) => Number(e.before_json.amount) === 5000 && Number(e.after_json.amount) === 5500), 'the amount change is logged with before and after');
  await as(org);

  // Void: the entry stays in the log, leaves the totals, cannot be edited, and can be restored. Everything is logged.
  await call("SELECT public.void_finance_entry($1, true, 'entered twice')", [refs]);
  s = await summary();
  assert.equal(Number(s.expense), 5500 + 50, 'voided entry is out of the totals');
  ledger = await call('SELECT * FROM public.get_finance_ledger($1)', [T1]);
  const v = ledger.find((l) => l.id === refs);
  assert.equal(v.voided, true); assert.match(v.void_note, /^Voided /);
  await fails("SELECT public.save_finance_entry($1, $2, 'EXPENSE', 'Referees', 1, current_date)", [T1, refs], /voided entry/);
  await call('SELECT public.void_finance_entry($1, false, NULL)', [refs]);
  assert.equal(Number((await summary()).expense), 5500 + 3000.5 + 50);
  const actions = (await raw("SELECT action FROM public.audit_logs WHERE tournament_id=$1 AND entity_type='FINANCE_ENTRY' ORDER BY created_at, id", [T1])).map((a) => a.action);
  for (const a of ['FINANCE_ENTRY_ADDED', 'FINANCE_ENTRY_EDITED', 'FINANCE_ENTRY_VOIDED', 'FINANCE_ENTRY_RESTORED']) assert.ok(actions.includes(a), a);
  // Nothing can be deleted through the app.
  await as(org);
  await fails('DELETE FROM public.finance_entries WHERE id=$1', [sponsor], /permission denied/);
  assert.equal((await raw('SELECT has_table_privilege($1, $2, $3) AS p', ['authenticated', 'public.finance_entries', 'SELECT']))[0].p, false);
  console.log('Finance log: PASS (entries, automatic fees and refunds, totals, edits, void/restore, audit trail, permissions)');
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
