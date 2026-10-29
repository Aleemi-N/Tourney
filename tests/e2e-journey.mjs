// Run:  PHOTO=<any .jpg> node tests/e2e-journey.mjs <output folder>
//       (needs: pnpm db:reset, the API (SPRING_PROFILES_ACTIVE=dev) on 8080, the production web build on 3100, `expo start --web --port 8081`;
//        restart the API first if you ran it recently, the sign-up limiter allows only a few accounts per hour)
// End-to-end journey on the real stack: production web build (3100), Spring API (8080), Expo web (8081), Postgres.
// A brand-new organizer creates a tournament and takes it all the way to certificates, with players, teams, fees,
// waitlist, UPI payments, fixtures, scoring, public pages, finance and an account deletion on the way.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const { Api } = await import('../src/lib/api/core.ts');
// A client that keeps nothing: each test account holds its own sign-in in memory.
const createClient = (url) => { let kept = null; return new Api(url, { store: { get: () => kept, set: (s) => { kept = s; } } }); };
const pg = require('pg');
const web = 'http://localhost:3100', mob = 'http://localhost:8081', API = 'http://localhost:8080';
const outDir = process.argv[2];
fs.mkdirSync(outDir, { recursive: true });
const PW = 'E2e-Journey-1!';
if (!process.env.PHOTO) throw new Error('Set PHOTO to the path of any .jpg file');
const PHOTO = fs.readFileSync(process.env.PHOTO);
const db = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5440/tourny' });
await db.connect();
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const one = async (sql, p = []) => (await q(sql, p))[0];
const browser = await chromium.launch();
const errors = [];
const log = (m) => console.log('✓ ' + m);
const stamp = Date.now();
const email = (n) => `e2e-${n}-${stamp}@tourny.local`;

// ---- API users (real sign-up, real JWT) ---------------------------------------------------------------------------------
async function account(name) {
  const c = createClient(API);
  const e = email(name.toLowerCase().split(' ')[0]);
  const up = await c.auth.signUp({ email: e, password: PW, options: { data: { full_name: name } } });
  assert.ok(!up.error, `sign-up ${name}: ${up.error?.message}`);
  const si = await c.auth.signInWithPassword({ email: e, password: PW });
  assert.ok(!si.error, `sign-in ${name}: ${si.error?.message}`);
  return { c, email: e, id: si.data.user.id, name, token: si.data.session.access_token };
}
const rpc = async (who, fn, args = {}) => { const r = await who.c.rpc(fn, args); if (r.error) throw new Error(`${fn} as ${who.name}: ${r.error.message ?? JSON.stringify(r.error)}`); return r.data; };
const rpcFails = async (who, fn, args, pattern) => { const r = await who.c.rpc(fn, args); assert.ok(r.error, `${fn} should fail`); assert.match(r.error.message, pattern); };
async function webLogin(e) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (er) => errors.push(`${e}: ${er.message}`));
  await p.goto(`${web}/login`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  await p.fill('#email', e); await p.fill('#password', PW);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }), p.click('button[type="submit"]')]);
  return p;
}
async function mobileLogin(e) {
  const p = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
  p.on('pageerror', (er) => errors.push(`${e}: ${er.message}`));
  await p.goto(mob, { waitUntil: 'load' });
  await p.getByRole('tab', { name: 'Account' }).click();
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByLabel('Email').fill(e);
  await p.getByLabel('Password', { exact: true }).fill(PW);
  await p.getByRole('button', { name: 'Sign in' }).last().click();
  await p.getByRole('button', { name: 'Sign out' }).first().waitFor({ timeout: 30000 });
  return p;
}
const waitFor = async (fn, what, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 300)); } throw new Error('timeout: ' + what); };
const upload = async (u, bucket = 'avatars') => { const path_ = `${u.id}/e2e.jpg`; const r = await u.c.storage.from(bucket).upload(path_, PHOTO, { contentType: 'image/jpeg', upsert: true }); assert.ok(!r.error, r.error?.message); return path_; };

let currentPage;
try {
  // ======================================================================================================================
  // 1. People
  // ======================================================================================================================
  const org = await account('Olivia Organizer');
  const players = [];
  for (const n of ['Pia One', 'Pat Two', 'Pam Three', 'Pru Four']) players.push(await account(n));
  const tom = await account('Tom Owner');
  const una = await account('Una Owner');
  log('7 people signed up through the real API');

  // ======================================================================================================================
  // 2. The organizer creates and publishes a tournament in the mobile app
  // ======================================================================================================================
  let m = currentPage = await mobileLogin(org.email);
  await m.goto(`${mob}/organizer/new`, { waitUntil: 'load' });
  await m.getByLabel('Organization name').fill('E2E Sports');
  await m.getByRole('button', { name: 'Continue' }).click();
  await m.getByLabel('Tournament name').waitFor({ timeout: 30000 });
  await m.getByLabel('Tournament name').fill('E2E Spring Cup');
  await m.getByRole('button', { name: 'Continue' }).click();
  await m.getByRole('radio', { name: 'League', exact: true }).click();
  await m.getByRole('radio', { name: 'Registered teams' }).click();
  await m.getByRole('button', { name: 'Continue' }).click();
  await m.getByRole('radio', { name: '1 set' }).click();
  await m.getByRole('button', { name: 'Continue' }).click();
  await m.getByRole('button', { name: 'Continue' }).click();
  await m.getByRole('button', { name: 'Open Registration' }).click();
  await m.waitForURL(/\/organizer\/[0-9a-f-]{36}/, { timeout: 40000 });
  const T = (await one("SELECT id, slug, status, is_public, format, league_mode FROM public.tournaments WHERE name='E2E Spring Cup'"));
  assert.deepEqual([T.status, T.is_public, T.format, T.league_mode], ['REGISTRATION', true, 'LEAGUE', 'REGISTERED_TEAM']);
  log(`organizer created and opened "E2E Spring Cup" in the mobile app (/${T.slug})`);

  // ======================================================================================================================
  // 3. Rules for the tournament, in the website settings
  // ======================================================================================================================
  const ow = currentPage = await webLogin(org.email);
  await ow.goto(`${web}/organizer/tournaments/${T.id}/settings`, { waitUntil: 'load' });
  await ow.getByText('Registration limits & age category').waitFor({ timeout: 60000 });
  await ow.getByLabel('Player limit').fill('3');
  await ow.getByLabel('Registration closes').fill('2031-01-01T18:00');
  await ow.getByRole('button', { name: 'Save limits' }).click();
  await ow.getByText('Registration limits saved.').waitFor({ timeout: 20000 });
  await ow.getByLabel('Player fee (₹)').fill('250');
  await ow.getByLabel('Team fee (₹)').fill('1000');
  await ow.getByRole('button', { name: 'Save fees' }).click();
  await ow.getByText(/Fees saved/).waitFor({ timeout: 20000 });
  await ow.getByLabel('Your UPI ID').fill('olivia@okhdfc');
  await ow.getByLabel('Name shown to players').fill('Olivia Organizer');
  await ow.getByRole('button', { name: 'Save UPI details' }).click();
  await ow.getByText(/UPI details saved/).waitFor({ timeout: 20000 });
  await ow.getByLabel('Live stream link').fill('https://www.youtube.com/live/e2e-demo');
  await ow.getByRole('button', { name: 'Save link' }).click();
  await ow.getByText(/Stream link saved/).waitFor({ timeout: 20000 });
  const form = ow.getByRole('form', { name: 'Add a sponsor' });
  await form.getByLabel('Name').fill('E2E Sponsor');
  await form.getByLabel('Website (optional)').fill('https://sponsor.example');
  await form.getByLabel('Level').selectOption({ label: 'Title sponsor' });
  await form.getByRole('button', { name: 'Add sponsor' }).click();
  await ow.getByText('Sponsor saved.').waitFor({ timeout: 30000 });
  const s = await one('SELECT max_players, player_registration_fee f, team_registration_fee tf, upi_id, stream_url FROM public.tournament_settings WHERE tournament_id=$1', [T.id]);
  assert.deepEqual([s.max_players, Number(s.f), Number(s.tf), s.upi_id], [3, 250, 1000, 'olivia@okhdfc']);
  log('organizer set the player limit, deadline, fees, UPI ID, stream link and a sponsor on the website');

  // ======================================================================================================================
  // 4. Four players register; the fourth lands on the waitlist and owes nothing yet
  // ======================================================================================================================
  const regIds = [];
  for (const [i, pl] of players.entries()) {
    const photo = await upload(pl);
    await rpc(pl, 'submit_player_registration', { p_tournament_id: T.id, p_display_name: pl.name, p_primary_position: i % 2 ? 'OUTSIDE_HITTER' : 'SETTER', p_photo_path: photo, p_place: 'Varkala' });
    regIds.push((await one('SELECT r.id FROM public.player_tournament_registrations r JOIN public.player_profiles p ON p.id=r.player_id WHERE p.user_id=$1 AND r.tournament_id=$2', [pl.id, T.id])).id);
  }
  const positions = (await q('SELECT waitlist_position w FROM public.player_tournament_registrations WHERE tournament_id=$1 ORDER BY created_at', [T.id])).map((r) => r.w);
  assert.deepEqual(positions, [null, null, null, 1], 'only the fourth player is waitlisted');
  assert.equal((await rpc(players[0], 'my_payments_due')).length, 1);
  assert.equal((await rpc(players[3], 'my_payments_due')).length, 0, 'a waitlisted player owes nothing yet');
  await rpcFails(players[3], 'submit_upi_payment', { p_kind: 'PLAYER', p_registration_id: regIds[3], p_utr: '400000000004' }, /waitlist/);
  log('four players registered; the fourth is "Waitlist #1" and cannot pay yet');

  // the public registration page tells people the rules
  const visitor = currentPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  visitor.on('pageerror', (er) => errors.push(`visitor: ${er.message}`));
  await visitor.goto(`${web}/t/${T.slug}`, { waitUntil: 'load' });
  await visitor.getByRole('link', { name: 'Watch live' }).waitFor({ timeout: 30000 });
  await visitor.getByText('E2E Sponsor').first().waitFor({ timeout: 20000 });
  log('public tournament page shows "Watch live" and the sponsor');

  // ======================================================================================================================
  // 5. Paying by UPI, confirming, approving
  // ======================================================================================================================
  const p1 = currentPage = await webLogin(players[0].email);
  await p1.goto(`${web}/player`, { waitUntil: 'load' });
  await p1.getByText('Payments due').waitFor({ timeout: 40000 });
  await p1.getByAltText('QR code to pay with any UPI app').waitFor({ timeout: 20000 });
  await p1.getByLabel('Attach a screenshot of the payment').setInputFiles(process.env.PHOTO);
  await p1.getByText(/^Screenshot: /).waitFor({ timeout: 30000 });
  await p1.getByLabel(/UPI reference number/).fill('4021 0000 0001');
  await p1.getByRole('button', { name: 'I have paid' }).click();
  await p1.getByText(/Waiting for the organizer to confirm/).waitFor({ timeout: 20000 });
  await rpc(players[1], 'submit_upi_payment', { p_kind: 'PLAYER', p_registration_id: regIds[1], p_utr: '402100000002' });
  await rpc(org, 'mark_registration_paid', { p_kind: 'PLAYER', p_registration_id: regIds[2], p_status: 'PAID', p_note: 'cash at the desk' });
  await rpcFails(org, 'approve_player_registration', { p_registration_id: regIds[0] }, /fee has not been paid/);
  log('Pia paid by UPI on the website (QR, screenshot, reference); approval is blocked until it is confirmed');

  await ow.goto(`${web}/organizer/tournaments/${T.id}/payments`, { waitUntil: 'load' });
  await ow.getByText(/UPI payments? waiting for you to confirm/).waitFor({ timeout: 40000 });
  await ow.getByRole('button', { name: new RegExp(`screenshot from Pia One`) }).click();
  await ow.getByRole('img', { name: 'Screenshot of the payment' }).waitFor({ timeout: 20000 });
  await ow.getByRole('button', { name: /Confirm Pia One was received/ }).click();
  await waitFor(async () => (await one("SELECT status FROM public.registration_payments WHERE registration_id=$1 ORDER BY created_at DESC LIMIT 1", [regIds[0]]))?.status === 'PAID', 'Pia confirmed');
  await ow.getByRole('button', { name: /Confirm Pat Two was received/ }).click();
  await waitFor(async () => (await one("SELECT status FROM public.registration_payments WHERE registration_id=$1 ORDER BY created_at DESC LIMIT 1", [regIds[1]]))?.status === 'PAID', 'Pat confirmed');
  for (const id of regIds.slice(0, 3)) await rpc(org, 'approve_player_registration', { p_registration_id: id });
  assert.equal(Number((await one("SELECT count(*) n FROM public.player_tournament_registrations WHERE tournament_id=$1 AND status='APPROVED'", [T.id])).n), 3);
  await rpcFails(org, 'approve_player_registration', { p_registration_id: regIds[3] }, /tournament is full|fee has not been paid/);
  log('organizer confirmed two UPI payments on the website, marked one as cash, approved three players; the fourth cannot be approved');

  // ======================================================================================================================
  // 6. Teams
  // ======================================================================================================================
  const appTom = await rpc(tom, 'submit_team_owner_application', { p_tournament_id: T.id, p_proposed_team_name: 'Tom Titans', p_team_short_name: 'TTN', p_logo_path: await upload(tom, 'logos'), p_place: 'Varkala', p_primary_color: '#0f766e', p_secondary_color: '#fde68a' });
  const appUna = await rpc(una, 'submit_team_owner_application', { p_tournament_id: T.id, p_proposed_team_name: 'Una Unicorns', p_team_short_name: 'UNI', p_logo_path: await upload(una, 'logos'), p_place: 'Kollam', p_primary_color: '#7c3aed', p_secondary_color: '#fde68a' });
  await rpcFails(org, 'approve_team_owner_application', { p_application_id: appTom }, /fee has not been paid/);
  await rpc(tom, 'submit_upi_payment', { p_kind: 'TEAM', p_registration_id: appTom, p_utr: '502200000001' });
  const tomPay = (await rpc(org, 'list_registration_payments', { p_tournament_id: T.id })).find((r) => r.registration_id === appTom);
  await rpc(org, 'review_upi_payment', { p_payment_id: tomPay.payment_id, p_accept: true });
  await rpc(org, 'mark_registration_paid', { p_kind: 'TEAM', p_registration_id: appUna, p_status: 'WAIVED', p_note: 'sponsored team' });
  await rpc(org, 'approve_team_owner_application', { p_application_id: appTom });
  await rpc(org, 'approve_team_owner_application', { p_application_id: appUna });
  const teams = await q("SELECT id, name FROM public.teams WHERE tournament_id=$1 ORDER BY name", [T.id]);
  assert.deepEqual(teams.map((t) => t.name), ['Tom Titans', 'Una Unicorns']);
  const [tTom, tUna] = [teams[0].id, teams[1].id];
  log('two teams applied; one paid by UPI, one was waived; both approved');

  // squads
  const playerIdOf = async (u) => (await one('SELECT id FROM public.player_profiles WHERE user_id=$1', [u.id])).id;
  await rpc(org, 'assign_player_manually', { p_tournament_id: T.id, p_player_id: await playerIdOf(players[0]), p_team_id: tTom, p_acquisition_amount: 0 });
  await rpc(org, 'assign_player_manually', { p_tournament_id: T.id, p_player_id: await playerIdOf(players[1]), p_team_id: tTom, p_acquisition_amount: 0 });
  await rpc(org, 'assign_player_manually', { p_tournament_id: T.id, p_player_id: await playerIdOf(players[2]), p_team_id: tUna, p_acquisition_amount: 0 });
  log('players assigned to the two squads');

  // ======================================================================================================================
  // 7. Fixtures, going live, and scoring a whole match
  // ======================================================================================================================
  const stageId = await rpc(org, 'save_tournament_stage', { p_tournament_id: T.id, p_stage_id: null, p_name: 'League Stage', p_stage_type: 'LEAGUE', p_sequence: 1, p_qualification_count: 2 });
  await rpc(org, 'generate_stage_fixtures', { p_stage_id: stageId });
  const match = await one("SELECT id, home_team_id, away_team_id FROM public.matches WHERE tournament_id=$1", [T.id]);
  assert.ok(match, 'a fixture was generated');
  const up = await org.c.from('tournaments').update({ status: 'LIVE' }).eq('id', T.id).select('status');
  assert.ok(!up.error && up.data?.length === 1, 'organizer can take the tournament live: ' + (up.error?.message ?? 'no row updated'));
  log('league stage created, fixture generated, tournament is live');

  const winner = match.home_team_id;
  for (let i = 0; i < 25; i++) await rpc(org, 'award_point', { p_match_id: match.id, p_team_id: i < 10 ? match.away_team_id : winner, p_idempotency_key: `e2e-${stamp}-${i}` });
  for (let i = 10; i < 25; i++) { /* the home side already reached 15 of its 25 above; keep scoring until the set is over */ }
  let state = await one('SELECT status, winner_team_id FROM public.matches WHERE id=$1', [match.id]);
  let guard = 0;
  while (state.status !== 'COMPLETED' && guard++ < 40) { await rpc(org, 'award_point', { p_match_id: match.id, p_team_id: winner, p_idempotency_key: `e2e-${stamp}-x${guard}` }); state = await one('SELECT status, winner_team_id FROM public.matches WHERE id=$1', [match.id]); }
  assert.equal(state.status, 'COMPLETED'); assert.equal(state.winner_team_id, winner);
  log('a match was scored point by point and completed');

  // ======================================================================================================================
  // 8. The public follows along
  // ======================================================================================================================
  await visitor.goto(`${web}/t/${T.slug}/results`, { waitUntil: 'load' });
  await visitor.getByText(teams.find((t) => t.id === winner).name).first().waitFor({ timeout: 30000 });
  await visitor.goto(`${web}/t/${T.slug}/table`, { waitUntil: 'load' });
  await visitor.getByText(/Tom Titans|Una Unicorns/).first().waitFor({ timeout: 30000 });
  const overlay = await (await browser.newContext({ viewport: { width: 1000, height: 300 } })).newPage();
  await overlay.goto(`${web}/embed/t/${T.slug}/overlay/${match.id}?sponsors=1`, { waitUntil: 'load' });
  await overlay.getByText('Final').waitFor({ timeout: 30000 });
  log('results, league table and the streaming overlay show the finished match');

  // ======================================================================================================================
  // 9. Finish the tournament; certificates
  // ======================================================================================================================
  await rpc(org, 'set_tournament_award', { p_tournament_id: T.id, p_name: 'Best Setter', p_player_id: await playerIdOf(players[0]), p_note: 'Smartest sets' });
  const done = await org.c.from('tournaments').update({ status: 'COMPLETED' }).eq('id', T.id).select('status');
  assert.ok(!done.error && done.data?.length === 1, 'tournament completes: ' + (done.error?.message ?? 'no row updated'));
  await ow.goto(`${web}/organizer/tournaments/${T.id}/certificates`, { waitUntil: 'load' });
  await ow.getByText(/Champions/).first().waitFor({ timeout: 40000 });
  await ow.getByText(/Participation/).first().waitFor();
  const champions = (await rpc(org, 'get_certificates', { p_tournament_id: T.id })).filter((c) => c.kind === 'CHAMPION');
  assert.ok(champions.length > 0 && champions.every((c) => c.team_name === teams.find((t) => t.id === winner).name), 'champions are the winning side');
  await visitor.goto(`${web}/t/${T.slug}/certificates?kind=PARTICIPANT`, { waitUntil: 'load' });
  await visitor.getByRole('button', { name: 'Print all' }).waitFor({ timeout: 30000 });
  assert.equal(await visitor.locator('section.certificate').count(), 3, 'one participation certificate per approved player');
  const p1c = currentPage = await webLogin(players[0].email);
  await p1c.goto(`${web}/player`, { waitUntil: 'load' });
  await p1c.getByText('My certificates').waitFor({ timeout: 40000 });
  await p1c.getByText('Receipts', { exact: true }).waitFor({ timeout: 20000 });
  log('tournament completed; champions, awards and participation certificates, and Pia sees hers plus her receipt');

  // ======================================================================================================================
  // 10. Money
  // ======================================================================================================================
  await ow.goto(`${web}/organizer/tournaments/${T.id}/finance`, { waitUntil: 'load' });
  await ow.getByRole('heading', { name: 'Income & expenses' }).waitFor({ timeout: 40000 });
  await ow.getByRole('button', { name: 'Add entry' }).click();
  await ow.locator('fieldset label', { hasText: 'Expense' }).click();
  await ow.getByRole('combobox', { name: 'Category' }).fill('Venue');
  await ow.getByLabel('Amount (₹)').fill('900');
  await ow.getByRole('button', { name: 'Save entry' }).click();
  await waitFor(async () => (await one("SELECT 1 x FROM public.finance_entries WHERE tournament_id=$1 AND category='Venue'", [T.id])) != null, 'expense saved');
  const sum = await rpc(org, 'get_finance_summary', { p_tournament_id: T.id });
  assert.equal(Number(sum.fees_collected), 250 + 250 + 250 + 1000, 'three players and one team paid; the waived team paid nothing');
  assert.equal(Number(sum.expense), 900); assert.equal(Number(sum.net), 1750 - 900);
  log('finance log: fees 1,750 collected automatically, a 900 expense added, net 850');

  // ======================================================================================================================
  // 11. Leaving: the waitlisted player downloads their data and deletes their account
  // ======================================================================================================================
  const p4 = currentPage = await webLogin(players[3].email);
  await p4.goto(`${web}/account`, { waitUntil: 'load' });
  await p4.getByRole('heading', { name: 'Your data' }).waitFor({ timeout: 30000 });
  const [dl] = await Promise.all([p4.waitForEvent('download'), p4.getByRole('button', { name: 'Download my data' }).click()]);
  await dl.saveAs(path.join(outDir, 'p4-data.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(outDir, 'p4-data.json'), 'utf8')).account.email, players[3].email);
  await p4.getByLabel('Type DELETE to confirm').fill('DELETE');
  await Promise.all([p4.waitForURL((u) => u.pathname === '/', { timeout: 30000 }), p4.getByRole('button', { name: 'Delete my account' }).click()]);
  assert.equal((await one('SELECT status FROM public.player_tournament_registrations WHERE id=$1', [regIds[3]])).status, 'WITHDRAWN');
  const stale = await fetch(`${API}/rest/profiles?select=id`, { headers: { Authorization: `Bearer ${players[3].token}` } });
  assert.equal(stale.status, 401, 'the deleted account\'s token is refused');
  const relogin = await createClient(API).auth.signInWithPassword({ email: players[3].email, password: PW });
  assert.ok(relogin.error, 'cannot sign in any more');
  log('waitlisted player downloaded their data and deleted their account; registration withdrawn, token refused, sign-in gone');

  assert.deepEqual(errors, [], 'no page errors in any browser');
  console.log('\nE2E JOURNEY PASSED');
} catch (e) {
  console.error('\nE2E JOURNEY FAILED:', e);
  await currentPage?.screenshot({ path: path.join(outDir, 'fail.png'), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close(); await db.end();
}
