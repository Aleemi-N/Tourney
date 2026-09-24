import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';

const supabaseUrl = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.LOCAL_SUPABASE_ANON_KEY;
const baseUrl = process.env.PHASE5C_BASE_URL ?? 'http://localhost:3000';
const password = process.env.LOCAL_QA_PASSWORD ?? 'TournyTest123!';

if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl) ||
    !/^http:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl)) {
  throw new Error('Owner visibility QA may run against local services only');
}
if (!anonKey) throw new Error('LOCAL_SUPABASE_ANON_KEY is required');

async function queryOwner(email) {
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(authError);
  const userId = authData.user.id;
  const result = await supabase
    .from('team_owners')
    .select('team_id, teams!inner(id, name, short_name, logo_path, place, tournament_id, tournaments(name))')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE');
  return { userId, data: result.data, error: result.error };
}

const owner = await queryOwner('owner@tourny.local');
const owner2 = await queryOwner('owner2@tourny.local');
console.log(JSON.stringify({ owner, owner2 }, null, 2));
assert.deepEqual(owner.data?.map((row) => row.teams.name), ['QA Falcons']);
assert.deepEqual(owner2.data?.map((row) => row.teams.name), ['QA Spikers']);

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
  const authCookies = (await context.cookies()).filter((cookie) => cookie.name.startsWith('sb-'));
  assert.ok(authCookies.length > 0, `${email} did not receive a Supabase auth cookie`);
  return { context, page };
}

try {
  const first = await login('owner@tourny.local');
  await first.page.goto(`${baseUrl}/owner`, { waitUntil: 'domcontentloaded' });
  await first.page.waitForURL('**/owner/dashboard');
  await first.page.getByRole('heading', { name: 'QA Falcons' }).waitFor();
  assert.equal(await first.page.getByText('QA Spikers', { exact: true }).count(), 0);
  await first.page.goto(`${baseUrl}/owner/teams/90300000-0000-0000-0000-000000000001`, { waitUntil: 'domcontentloaded' });
  await first.page.getByRole('heading', { name: 'QA Falcons' }).waitFor();
  await first.page.getByRole('link', { name: 'Open live auction' }).click();
  await first.page.waitForURL('**/auction');
  await first.page.getByRole('heading', { name: 'Vivek Kumar' }).waitFor();
  await first.page.getByText(/Category base.*500/).waitFor();
  await first.page.getByText('Team finance', { exact: true }).waitFor();
  await first.page.getByText('Min-squad reserve', { exact: true }).waitFor();
  await first.page.getByText('Maximum bid', { exact: true }).waitFor();
  const bidReady = await first.page.getByRole('button', { name: 'Place bid' }).isEnabled();
  const auctionStatus = (await first.page.locator('span').filter({ hasText: /^(LIVE|PAUSED)$/ }).first().textContent())?.trim() ?? 'UNKNOWN';
  await first.page.goto(`${baseUrl}/profile#my-tournaments`, { waitUntil: 'domcontentloaded' });
  await first.page.getByText('Team Owner', { exact: true }).waitFor();
  await first.page.getByRole('link', { name: 'Go to Team Portal' }).waitFor();
  await first.page.getByRole('link', { name: 'Open Team Portal' }).waitFor();
  await first.context.close();

  const second = await login('owner2@tourny.local');
  await second.page.goto(`${baseUrl}/owner`, { waitUntil: 'domcontentloaded' });
  await second.page.waitForURL('**/owner/dashboard');
  await second.page.getByRole('heading', { name: 'QA Spikers' }).waitFor();
  assert.equal(await second.page.getByText('QA Falcons', { exact: true }).count(), 0);
  const forbidden = await second.page.goto(`${baseUrl}/owner/teams/90300000-0000-0000-0000-000000000001`, { waitUntil: 'domcontentloaded' });
  assert.equal(forbidden?.status(), 404);
  assert.equal(await second.page.getByRole('heading', { name: 'QA Falcons' }).count(), 0);
  await second.context.close();

  console.log(JSON.stringify({
    status: 'PASS',
    ownerTeam: 'QA Falcons',
    owner2Team: 'QA Spikers',
    crossOwnerBlocked: true,
    livePlayer: 'Vivek Kumar',
    categoryBase: 500,
    auctionStatus,
    bidReady,
    profileTeamPortal: true,
  }));
} finally {
  await browser.close();
}
