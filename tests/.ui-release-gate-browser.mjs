import assert from 'node:assert/strict';
import pg from 'pg';
import { chromium } from '@playwright/test';

const base = 'http://localhost:3100';
const password = 'TournyTest123!';
const tournament = '90200000-0000-0000-0000-000000000001';
const team = '90300000-0000-0000-0000-000000000001';
const match = '90700000-0000-0000-0000-000000000001';
const widths = [320, 390, 768, 1024, 1440];
const browser = await chromium.launch({ headless: true });
const db = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await db.connect();

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const state = await context.storageState();
  await context.close();
  return state;
}

async function check(name, path, state, expected) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, storageState: state, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    if (expected) await page.waitForFunction((text) => document.body.innerText.toLowerCase().includes(text.toLowerCase()), expected);
    const size = await page.evaluate(() => ({ viewport: innerWidth, html: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(response && response.status() < 500, `${name}@${width} returned ${response?.status()}`);
    assert.ok(size.html <= size.viewport && size.body <= size.viewport, `${name}@${width} overflow ${JSON.stringify(size)}`);
    assert.deepEqual(errors, [], `${name}@${width} browser errors`);
    if (width < 768) {
      const shell = page.locator('.app-shell-content');
      if (await shell.count()) assert.ok(parseFloat(await shell.evaluate((el) => getComputedStyle(el).paddingBottom)) >= 64, `${name}@${width} lacks bottom-nav clearance`);
    }
    console.log(JSON.stringify({ name, width, status: response.status(), overflow: false }));
    await context.close();
  }
}

async function checkPwa() {
  const chromiumContext = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await chromiumContext.addInitScript(() => {
    window.__promptCalls = 0;
    const send = () => {
      const event = new Event('beforeinstallprompt');
      event.prompt = async () => { window.__promptCalls += 1; };
      event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(event);
    };
    window.addEventListener('DOMContentLoaded', send);
    window.addEventListener('load', send);
    const id = setInterval(send, 100);
    setTimeout(() => clearInterval(id), 5000);
  });
  const page = await chromiumContext.newPage();
  await page.goto(base);
  const install = page.getByRole('button', { name: 'Install Tourny' }).first();
  await install.waitFor();
  await install.click();
  assert.equal(await page.evaluate(() => window.__promptCalls), 1);
  await chromiumContext.close();

  const installedContext = await browser.newContext();
  await installedContext.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(display-mode: standalone)' ? { matches: true, media: query, onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent: () => true } : original(query);
  });
  const installedPage = await installedContext.newPage();
  await installedPage.goto(base);
  assert.equal(await installedPage.getByRole('button', { name: 'Install Tourny' }).count(), 0);
  await installedContext.close();

  const ios = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
  const iosPage = await ios.newPage();
  await iosPage.goto(base);
  await iosPage.getByRole('button', { name: 'Install Tourny' }).first().click();
  await iosPage.getByRole('dialog', { name: 'Install Tourny' }).waitFor();
  await iosPage.getByText('Add to Home Screen', { exact: true }).waitFor();
  await ios.close();
  console.log(JSON.stringify({ pwa: 'PASS' }));
}

let resetFixtures;
try {
  const organizer = await login('organizer@tourny.local');
  const owner = await login('owner@tourny.local');
  const player = await login('player@tourny.local');
  const scorer = await login('scorer@tourny.local');
  const superAdmin = await login('super-admin@tourny.local');
  resetFixtures = async () => {
    await db.query("UPDATE public.teams SET name=CASE WHEN id='90300000-0000-0000-0000-000000000001' THEN 'QA Falcons' ELSE 'QA Eagles' END, short_name=CASE WHEN id='90300000-0000-0000-0000-000000000001' THEN 'QAF' ELSE 'QAE' END WHERE id IN ('90300000-0000-0000-0000-000000000001','90300000-0000-0000-0000-000000000002')");
    await db.query("UPDATE public.matches SET status='SCHEDULED' WHERE id=$1", [match]);
    await db.query("UPDATE public.match_sets SET status='PENDING', started_at=NULL WHERE match_id=$1", [match]);
    await db.query("DELETE FROM public.match_timeouts WHERE match_id=$1", [match]);
  };
  await resetFixtures();

  const routes = [
    ['organizer-dashboard', '/organizer/dashboard', organizer, 'Dashboard'],
    ['organizer-overview', `/organizer/tournaments/${tournament}`, organizer, 'Tourny Local QA Cup'],
    ['organizer-teams', `/organizer/tournaments/${tournament}/teams`, organizer, 'Teams'],
    ['organizer-players', `/organizer/tournaments/${tournament}/participants`, organizer, 'Participants'],
    ['organizer-fixtures', `/organizer/tournaments/${tournament}/fixtures`, organizer, 'Fixtures'],
    ['organizer-staff', `/organizer/tournaments/${tournament}/staff`, organizer, 'Staff'],
    ['organizer-settings', `/organizer/tournaments/${tournament}/settings`, organizer, 'Settings'],
    ['organizer-lot', `/organizer/tournaments/${tournament}/lot`, organizer, 'Lot'],
    ['organizer-auction', `/organizer/tournaments/${tournament}/auction`, organizer, 'Auction'],
    ['owner-dashboard', '/owner/dashboard', owner, 'QA Falcons'],
    ['owner-team', `/owner/teams/${team}`, owner, 'QA Falcons'],
    ['owner-squad', `/owner/teams/${team}/squad`, owner, 'Squad'],
    ['owner-fixtures', `/owner/teams/${team}/fixtures`, owner, 'Fixtures'],
    ['owner-results', `/owner/teams/${team}/results`, owner, 'Results'],
    ['owner-auction', `/owner/teams/${team}/auction`, owner, 'Auction'],
    ['player-home', '/player', player, 'My tournaments'],
    ['player-profile', '/player/profile', player, 'Player Profile'],
    ['scorer-home', '/scorer', scorer, 'Assigned matches'],
    ['scorer-scheduled', `/scorer/matches/${match}`, scorer, 'SCHEDULED'],
    ['super-admin-dashboard', '/super-admin', superAdmin, 'Platform Dashboard'],
    ['super-admin-approvals', '/super-admin/approvals', superAdmin, 'Approvals'],
    ['super-admin-tournaments', '/super-admin/tournaments', superAdmin, 'Tournaments'],
    ['super-admin-organizers', '/super-admin/organizers', superAdmin, 'Organizers'],
    ['super-admin-audit', '/super-admin/audit', superAdmin, 'Audit'],
  ];
  for (const route of routes) await check(...route);

  await db.query("UPDATE public.teams SET name=CASE WHEN id='90300000-0000-0000-0000-000000000001' THEN 'Metropolitan Volleyball Athletic Association' ELSE 'International Coastal Sporting Collective' END, short_name=NULL WHERE id IN ('90300000-0000-0000-0000-000000000001','90300000-0000-0000-0000-000000000002')");
  await db.query("UPDATE public.matches SET status='LIVE' WHERE id=$1", [match]);
  await db.query("UPDATE public.match_sets SET status='LIVE', started_at=now() WHERE match_id=$1 AND set_number=1", [match]);
  const setId = (await db.query('SELECT id FROM public.match_sets WHERE match_id=$1 AND set_number=1', [match])).rows[0].id;
  await db.query("INSERT INTO public.match_timeouts(match_id,match_set_id,team_id,timeout_number,duration_seconds,started_at,created_by) VALUES($1,$2,$3,1,3600,now(),$4)", [match, setId, '90300000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000004']);
  await check('scorer-live-timeout-long-names', `/scorer/matches/${match}`, scorer, 'Timeout Active');
  await checkPwa();
} finally {
  await resetFixtures().catch(() => { });
  await db.end();
  await browser.close();
}
