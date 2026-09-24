import assert from 'node:assert/strict';
import pg from 'pg';
import { chromium } from '@playwright/test';

const databaseUrl = process.env.M25_DATABASE_URL;
const baseUrl = process.env.PHASE5C_BASE_URL ?? 'http://localhost:3000';
if (!databaseUrl || !/127\.0\.0\.1|localhost/.test(databaseUrl)) {
  throw new Error('M25_DATABASE_URL must point to local Postgres');
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl)) {
  throw new Error('PHASE5C_BASE_URL must point to the local application');
}

const tournamentId = '90200000-0000-0000-0000-000000000001';
const password = 'TournyTest123!';
const browser = await chromium.launch({ headless: true });

async function loginAndVerify(email, expectedPath) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  await page.goto(`${baseUrl}${expectedPath}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

try {
  const organizer = await loginAndVerify(
    'organizer@tourny.local',
    `/organizer/tournaments/${tournamentId}/auction`,
  );
  console.log('Organizer authenticated');
  await organizer.page.getByText('Auction Ready', { exact: true }).waitFor({ state: 'visible' });
  await organizer.page.getByText(/2 teams.*12 eligible players/).waitFor({ state: 'visible' });
  const prepare = organizer.page.getByRole('button', { name: 'Prepare Auction' });
  await prepare.waitFor({ state: 'visible' });
  assert.equal(await prepare.isEnabled(), true);
  assert.equal(await organizer.page.getByText('NO_ELIGIBLE_PLAYERS').count(), 0);
  assert.equal(await organizer.page.getByText('MINIMUM_SQUADS_UNREACHABLE').count(), 0);
  await organizer.context.close();
  console.log('Organizer readiness verified');

  const owner1 = await loginAndVerify('owner@tourny.local', '/owner/teams/90300000-0000-0000-0000-000000000001');
  await owner1.page.getByRole('heading', { name: 'QA Falcons' }).waitFor({ state: 'visible' });
  await owner1.context.close();
  console.log('Owner one authenticated');

  const owner2 = await loginAndVerify('owner2@tourny.local', '/owner/teams/90300000-0000-0000-0000-000000000002');
  await owner2.page.getByRole('heading', { name: 'QA Spikers' }).waitFor({ state: 'visible' });
  await owner2.context.close();
  console.log('Owner two authenticated');

  const db = new pg.Client({ connectionString: databaseUrl });
  await db.connect();
  const auctionCount = Number((await db.query(
    'SELECT count(*) FROM public.auctions WHERE tournament_id=$1',
    [tournamentId],
  )).rows[0].count);
  await db.end();
  assert.equal(auctionCount, 0, 'UI verification must not prepare the auction');

  console.log(JSON.stringify({
    status: 'PASS',
    organizerReady: true,
    eligiblePlayers: 12,
    prepareEnabled: true,
    ownersAuthenticated: ['owner@tourny.local', 'owner2@tourny.local'],
    auctionPrepared: false,
  }));
} finally {
  await browser.close();
}
