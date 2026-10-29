// Owner visibility QA against the local seed (db/seed.sql) and a running app.
// Each owner must see only their own teams, in the data layer and in the portal,
// and must get a 404 on another owner's team page.
// Run: PHASE5C_BASE_URL=http://localhost:3000 node tests/phase5c-owner-visibility.test.mjs   (needs the API on 8080 and the website, both on the seeded local database)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Api } from '../src/lib/api/core.ts';
import { chromium } from '@playwright/test';

const apiUrl = process.env.LOCAL_API_URL ?? 'http://127.0.0.1:8080';
const baseUrl = process.env.PHASE5C_BASE_URL ?? 'http://localhost:3000';
// The seed's single local-only password, read from the seed so it lives in one place.
const password = process.env.LOCAL_QA_PASSWORD
  ?? readFileSync(new URL('../db/seed.sql', import.meta.url), 'utf8').match(/extensions\.crypt\('([^']+)'/)[1];

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(apiUrl) ||
    !/^http:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl)) {
  throw new Error('Owner visibility QA may run against local services only');
}

// Seeded ownership (db/seed.sql): owner@ owns one team per tournament, owner2@ another.
const OWNER_TEAMS = ['Estuary Eagles', 'Harbour Hawks', 'Kayal Kings', 'QA Falcons', 'Rainmakers'];
const OWNER2_TEAMS = ['Breakwater Blasters', 'Canal Cobras', 'Coastline Strikers', 'Thunder Spikers'];
const OWNER_AUCTION_TEAM = '90300000-0000-0000-0000-000000000021'; // Harbour Hawks, live auction

async function queryOwner(email) {
  let kept = null;
  const api = new Api(apiUrl, { store: { get: () => kept, set: (session) => { kept = session; } } });
  const { data: authData, error: authError } = await api.auth.signInWithPassword({ email, password });
  assert.ifError(authError);
  const result = await api
    .from('team_owners')
    .select('team_id, teams!inner(id, name)')
    .eq('user_id', authData.user.id)
    .eq('status', 'ACTIVE');
  assert.ifError(result.error);
  return result.data.map((row) => row.teams.name).sort();
}

assert.deepEqual(await queryOwner('owner@tourny.local'), OWNER_TEAMS);
assert.deepEqual(await queryOwner('owner2@tourny.local'), OWNER2_TEAMS);

const browser = await chromium.launch({ headless: true });
async function login(email) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'load' });
  // The login is a client form that invokes a server action; wait for hydration
  // so Playwright cannot accidentally perform the browser's default GET submit.
  await page.waitForTimeout(1_500);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  const authCookies = (await context.cookies()).filter((cookie) => cookie.name === 'tourny-session');
  assert.ok(authCookies.length > 0, `${email} did not receive a session cookie`);
  return { context, page };
}

try {
  const first = await login('owner@tourny.local');
  await first.page.goto(`${baseUrl}/owner`, { waitUntil: 'domcontentloaded' });
  await first.page.waitForURL('**/owner/dashboard');
  for (const team of OWNER_TEAMS) await first.page.getByText(team, { exact: true }).filter({ visible: true }).first().waitFor();
  for (const team of OWNER2_TEAMS) assert.equal(await first.page.getByText(team, { exact: true }).count(), 0, `owner@ sees ${team}`);

  await first.page.goto(`${baseUrl}/owner/teams/${OWNER_AUCTION_TEAM}/auction`, { waitUntil: 'domcontentloaded' });
  await first.page.getByRole('heading', { name: 'Harbour Hawks' }).waitFor();
  // Bids are called out in the venue; the owner view never offers a bid control.
  await first.page.getByText('Bidding is Managed Offline').waitFor();
  assert.equal(await first.page.getByRole('button', { name: /place bid/i }).count(), 0);

  await first.page.goto(`${baseUrl}/profile#my-tournaments`, { waitUntil: 'domcontentloaded' });
  await first.page.getByText('Team Owner', { exact: true }).filter({ visible: true }).first().waitFor();
  await first.page.getByRole('link', { name: /Team Portal/ }).first().waitFor();
  await first.context.close();

  const second = await login('owner2@tourny.local');
  await second.page.goto(`${baseUrl}/owner`, { waitUntil: 'domcontentloaded' });
  await second.page.waitForURL('**/owner/dashboard');
  await second.page.getByText('Coastline Strikers', { exact: true }).filter({ visible: true }).first().waitFor();
  assert.equal(await second.page.getByText('Harbour Hawks', { exact: true }).count(), 0);
  const forbidden = await second.page.goto(`${baseUrl}/owner/teams/${OWNER_AUCTION_TEAM}`, { waitUntil: 'domcontentloaded' });
  assert.equal(forbidden?.status(), 404);
  assert.equal(await second.page.getByRole('heading', { name: 'Harbour Hawks' }).count(), 0);
  await second.context.close();

  console.log(JSON.stringify({ status: 'PASS', ownerTeams: OWNER_TEAMS.length, owner2Teams: OWNER2_TEAMS.length, crossOwnerBlocked: true }));
} finally {
  await browser.close();
}
