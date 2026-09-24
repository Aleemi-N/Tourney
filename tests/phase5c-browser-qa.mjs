import assert from 'node:assert/strict';
import pg from 'pg';
import { chromium } from '@playwright/test';

const databaseUrl = process.env.M25_DATABASE_URL;
const baseUrl = process.env.PHASE5C_BASE_URL ?? 'http://127.0.0.1:3000';
if (!databaseUrl || !/127\.0\.0\.1|localhost/.test(databaseUrl)) {
  throw new Error('M25_DATABASE_URL must point to local Postgres');
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(baseUrl)) {
  throw new Error('PHASE5C_BASE_URL must point to the local application');
}

const tournamentId = '90200000-0000-0000-0000-000000000001';
const organizerId = '90000000-0000-0000-0000-000000000001';
const owner1Id = '90000000-0000-0000-0000-000000000002';
const owner2Id = '90000000-0000-0000-0000-000000000005';
const team1Id = '90300000-0000-0000-0000-000000000001';
const team2Id = '90300000-0000-0000-0000-000000000002';
const owner2Email = 'owner2@tourny.local';
const password = 'TournyTest123!';
const playerIds = Array.from(
  { length: 6 },
  (_, index) => `91400000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
);

const admin = new pg.Client({ connectionString: databaseUrl });
const roleClients = [];

async function authenticated(userId) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('SET ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`, [userId]);
  roleClients.push(client);
  return client;
}

async function removeAuction() {
  await admin.query(
    `DELETE FROM public.purse_transactions
     WHERE wallet_id IN (
       SELECT w.id FROM public.auction_team_wallets w
       JOIN public.auctions a ON a.id=w.auction_id WHERE a.tournament_id=$1
     )`,
    [tournamentId],
  );
  await admin.query(
    `DELETE FROM public.auction_sales
     WHERE auction_player_id IN (
       SELECT ap.id FROM public.auction_players ap
       JOIN public.auctions a ON a.id=ap.auction_id WHERE a.tournament_id=$1
     )`,
    [tournamentId],
  );
  await admin.query(
    `DELETE FROM public.auction_bids
     WHERE auction_id IN (SELECT id FROM public.auctions WHERE tournament_id=$1)`,
    [tournamentId],
  );
  await admin.query('DELETE FROM public.auctions WHERE tournament_id=$1', [tournamentId]);
}

async function cleanup() {
  await removeAuction();
  await admin.query(
    `DELETE FROM public.player_tournament_registrations
     WHERE tournament_id=$1 AND player_id=ANY($2::uuid[])`,
    [tournamentId, playerIds],
  );
  await admin.query('DELETE FROM public.player_profiles WHERE id=ANY($1::uuid[])', [playerIds]);
  await admin.query(
    'DELETE FROM public.team_owners WHERE user_id=$1 OR (user_id=$2 AND team_id=$3)',
    [owner2Id, owner1Id, team2Id],
  );
  await admin.query('DELETE FROM public.tournament_members WHERE tournament_id=$1 AND user_id=$2', [tournamentId, owner2Id]);
  await admin.query('DELETE FROM auth.users WHERE id=$1', [owner2Id]);
}

async function setup() {
  await cleanup();
  await admin.query(
    `UPDATE auth.users SET
       confirmation_token=COALESCE(confirmation_token,''),
       recovery_token=COALESCE(recovery_token,''),
       email_change_token_new=COALESCE(email_change_token_new,''),
       email_change=COALESCE(email_change,''),
       phone_change_token=COALESCE(phone_change_token,''),
       email_change_token_current=COALESCE(email_change_token_current,''),
       reauthentication_token=COALESCE(reauthentication_token,'')
     WHERE email IN ('organizer@tourny.local','owner@tourny.local')`,
  );
  await admin.query(
    `INSERT INTO auth.users(
       instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
       raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous,
       confirmation_token,recovery_token,email_change_token_new,email_change,
       phone_change_token,email_change_token_current,reauthentication_token
     ) VALUES(
       '00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
       extensions.crypt($3,extensions.gen_salt('bf')),now(),
       '{"provider":"email","providers":["email"]}',
       '{"full_name":"QA Team Owner Two"}',now(),now(),false,false,
       '','','','','','',''
     )`,
    [owner2Id, owner2Email, password],
  );
  await admin.query(
    `INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
     VALUES($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text),'email',now(),now())`,
    [owner2Id, owner2Email],
  );
  await admin.query(
    `INSERT INTO public.tournament_members(tournament_id,user_id,role,status)
     VALUES($1,$2,'TEAM_OWNER','ACTIVE')`,
    [tournamentId, owner2Id],
  );
  await admin.query(
    `INSERT INTO public.team_owners(team_id,user_id,is_primary,status) VALUES
       ($1,$2,false,'ACTIVE'),($1,$3,true,'ACTIVE')`,
    [team2Id, owner1Id, owner2Id],
  );

  for (const [index, playerId] of playerIds.entries()) {
    await admin.query(
      `INSERT INTO public.player_profiles(
         id,display_name,primary_position,secondary_position,place
       ) VALUES($1,$2,'OUTSIDE_HITTER','SETTER','Local QA')`,
      [playerId, `Responsive Integration Player ${index + 1} With A Long Name`],
    );
    await admin.query(
      `INSERT INTO public.player_tournament_registrations(
         tournament_id,player_id,status,registration_number
       ) VALUES($1,$2,'PENDING',$3)`,
      [tournamentId, playerId, `BROWSER-${index + 1}`],
    );
  }

  const organizer = await authenticated(organizerId);
  await organizer.query(
    `SELECT public.update_auction_price_categories(
       $1,'Category A Premium International',500,
       'Category B Standard Selection',300,
       'Category C Development Pathway',100
     )`,
    [tournamentId],
  );
  const categories = (
    await admin.query(
      `SELECT id FROM public.tournament_auction_categories
       WHERE tournament_id=$1 ORDER BY display_order`,
      [tournamentId],
    )
  ).rows;
  const registrations = (
    await admin.query(
      `SELECT id FROM public.player_tournament_registrations
       WHERE tournament_id=$1 AND player_id=ANY($2::uuid[]) ORDER BY registration_number`,
      [tournamentId, playerIds],
    )
  ).rows;
  for (const [index, registration] of registrations.entries()) {
    await organizer.query(
      `SELECT public.approve_player_registration($1,'MAIN_AUCTION',NULL,$2)`,
      [registration.id, categories[Math.min(index, 2)].id],
    );
  }
  const prepared = (
    await organizer.query('SELECT public.prepare_auction($1) value', [tournamentId])
  ).rows[0].value;
  const preparedState = (
    await organizer.query('SELECT public.get_auction_organizer_state($1) value', [prepared.auction_id])
  ).rows[0].value;
  const started = (
    await organizer.query(
      "SELECT public.set_auction_lifecycle($1,'START',$2,'browser-start') value",
      [prepared.auction_id, preparedState.auction.state_version],
    )
  ).rows[0].value;
  await organizer.query(
    "SELECT public.open_next_auction_player($1,$2,'browser-open')",
    [prepared.auction_id, started.state_version],
  );
  return prepared.auction_id;
}

function watchConsole(page, issues) {
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
}

async function assertNoOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    offenders: Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.getAttribute('class'),
          text: element.textContent?.trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((element) => element.right > window.innerWidth + 1 || element.scrollWidth > element.clientWidth + 1)
      .slice(0, 30),
  }));
  assert.ok(dimensions.document <= dimensions.viewport, `${label}: document overflow ${JSON.stringify(dimensions)}`);
  assert.ok(dimensions.body <= dimensions.viewport, `${label}: body overflow ${JSON.stringify(dimensions)}`);
}

async function login(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

await admin.connect();
let browser;

try {
  const auctionId = await setup();
  browser = await chromium.launch({ headless: true });
  const organizerState = await login(browser, 'organizer@tourny.local');
  const ownerState = await login(browser, 'owner@tourny.local');
  const owner2State = await login(browser, owner2Email);
  const widths = [320, 375, 390, 768, 1024, 1440];
  const results = [];

  for (const width of widths) {
    for (const target of [
      {
        name: 'organizer',
        path: `/organizer/tournaments/${tournamentId}/auction`,
        storageState: organizerState,
        heading: 'Auction Control',
        marker: 'Pause',
      },
      {
        name: 'owner',
        path: `/owner/teams/${team1Id}/auction`,
        storageState: ownerState,
        heading: 'Current player',
        marker: 'Place bid',
      },
      {
        name: 'public',
        path: '/t/tourny-local-qa-cup/live',
        storageState: undefined,
        heading: 'Live Auction',
        marker: 'No Bids Yet',
      },
    ]) {
      const issues = [];
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        storageState: target.storageState,
        reducedMotion: width === 390 ? 'reduce' : 'no-preference',
      });
      const page = await context.newPage();
      watchConsole(page, issues);
      await page.goto(`${baseUrl}${target.path}`, { waitUntil: 'domcontentloaded' });
      await page.getByText(target.heading, { exact: false }).first().waitFor({ state: 'visible' });
      await page.getByText(target.marker, { exact: false }).first().waitFor({ state: 'visible' });
      await assertNoOverflow(page, `${target.name}@${width}`);
      assert.deepEqual(issues, [], `${target.name}@${width} console issues`);
      results.push(`${target.name}@${width}`);
      await context.close();
    }
  }

  const ownerMobile = await browser.newContext({ viewport: { width: 320, height: 900 }, storageState: ownerState });
  const ownerMobilePage = await ownerMobile.newPage();
  await ownerMobilePage.goto(`${baseUrl}/owner/teams/${team1Id}/auction`, { waitUntil: 'domcontentloaded' });
  await ownerMobilePage.getByText('Switch team', { exact: true }).waitFor({ state: 'visible' });
  await ownerMobilePage.getByLabel('Bid amount').fill('500');
  assert.equal(await ownerMobilePage.getByRole('button', { name: 'Place bid' }).isEnabled(), true);
  await ownerMobile.close();

  const owner2Context = await browser.newContext({ viewport: { width: 390, height: 900 }, storageState: owner2State });
  const owner2Page = await owner2Context.newPage();
  await owner2Page.goto(`${baseUrl}/owner/teams/${team2Id}/auction`, { waitUntil: 'domcontentloaded' });
  await owner2Page.getByRole('button', { name: 'Place bid' }).waitFor({ state: 'visible' });
  await owner2Context.close();

  console.log(JSON.stringify({
    status: 'PASS',
    auctionId,
    authenticated: ['organizer@tourny.local', 'owner@tourny.local', owner2Email],
    checks: results,
    reducedMotion: 'public@390',
    mobileTeamSwitch: true,
    bidCtaUsable: true,
    console: 'CLEAN',
  }));
} finally {
  if (browser) await browser.close();
  await Promise.allSettled(roleClients.map((client) => client.end()));
  await cleanup();
  await admin.end();
}
