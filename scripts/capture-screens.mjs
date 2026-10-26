// Screenshots every app route, per role, at 375 / 768 / 1440 px in light and dark.
//
// Usage: node scripts/capture-screens.mjs <label> [--out <dir>] [--base <url>] [--match <text>] [--widths 375,1440]
//   <label>  folder name for this set, e.g. "before" or "after"
//   --out    parent folder (default: ./screenshots, gitignored)
//   --base   running app (default: http://localhost:3000)
//   --match  only routes whose role or path contains this text
//   --widths comma-separated widths (default: 375,768,1440)
//
// Needs the local seed (`pnpm supabase db reset`) and the app running against it.
import { chromium } from '@playwright/test';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const label = args[0];
if (!label || label.startsWith('--')) {
  console.error('Usage: node scripts/capture-screens.mjs <label> [--out <dir>] [--base <url>] [--match <text>] [--widths 375,1440]');
  process.exit(1);
}
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = opt('--base', 'http://localhost:3000').replace(/\/+$/, '');
const outDir = path.resolve(opt('--out', 'screenshots'), label);
const WIDTHS = opt('--widths', '375,768,1440').split(',').map(Number);
const only = opt('--match', '');
const SCHEMES = ['light', 'dark'];

// The seed's one local-only password, read from the seed itself so it lives in one place.
const password = fs.readFileSync('supabase/seed.sql', 'utf8').match(/extensions\.crypt\('([^']+)'/)[1];

const db = new pg.Client({ connectionString: process.env.LOCAL_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await db.connect();
const matchId = async (status) => (await db.query(
  "SELECT id FROM public.matches WHERE stage_id = '90500000-0000-0000-0000-000000000003' AND status = $1 ORDER BY program_order LIMIT 1", [status],
)).rows[0].id;
const liveMatch = await matchId('LIVE');
const doneMatch = await matchId('COMPLETED');
await db.end();

const T = (n) => `90200000-0000-0000-0000-00000000000${n}`;
const S = { qa: 'tourny-local-qa-cup', auction: 'coastal-volleyball-league-2026', league: 'harbour-premier-league', done: 'monsoon-cup-2025', lot: 'lagoon-masters-2026' };
const auctionTeam = '90300000-0000-0000-0000-000000000021';
const leagueTeam = '90300000-0000-0000-0000-000000000031';

const ACCOUNTS = {
  organizer: 'organizer@tourny.local',
  owner: 'owner@tourny.local',
  player: 'player@tourny.local',
  scorer: 'scorer@tourny.local',
  admin: 'super-admin@tourny.local',
};

// [route pattern as in src/app, role, concrete paths]
const ROUTES = [
  ['/', 'public', ['/']],
  ['/login', 'public', ['/login']],
  ['/register', 'public', ['/register']],
  ['/forgot-password', 'public', ['/forgot-password']],
  ['/reset-password', 'public', ['/reset-password']],
  ['/t/[slug]', 'public', [`/t/${S.league}`, `/t/${S.qa}`, `/t/${S.done}`]],
  ['/t/[slug]/fixtures', 'public', [`/t/${S.league}/fixtures`]],
  ['/t/[slug]/results', 'public', [`/t/${S.league}/results`]],
  ['/t/[slug]/table', 'public', [`/t/${S.league}/table`, `/t/${S.done}/table`]],
  ['/t/[slug]/teams', 'public', [`/t/${S.league}/teams`]],
  ['/t/[slug]/players', 'public', [`/t/${S.auction}/players`]],
  ['/t/[slug]/live', 'public', [`/t/${S.auction}/live`, `/t/${S.lot}/live`, `/t/${S.league}/live`]],
  ['/t/[slug]/match/[matchId]', 'public', [`/t/${S.league}/match/${liveMatch}`, `/t/${S.league}/match/${doneMatch}`]],
  ['/t/[slug]/match/[matchId]/tv', 'public', [`/t/${S.league}/match/${liveMatch}/tv`]],
  ['/t/[slug]/register/player', 'public', [`/t/${S.qa}/register/player`]],
  ['/t/[slug]/register/player', 'player', [`/t/${S.qa}/register/player`]],
  ['/t/[slug]/register/owner', 'player', [`/t/${S.qa}/register/owner`]],
  ['/t/[slug]/register/team', 'player', [`/t/${S.qa}/register/team`]],
  ['/organizer', 'organizer', ['/organizer']],
  ['/organizer/dashboard', 'organizer', ['/organizer/dashboard']],
  ['/organizer/onboarding', 'organizer', ['/organizer/onboarding']],
  ['/organizer/tournaments', 'organizer', ['/organizer/tournaments']],
  ['/organizer/tournaments/new', 'organizer', ['/organizer/tournaments/new']],
  ['/organizer/tournaments/[id]', 'organizer', [`/organizer/tournaments/${T(3)}`, `/organizer/tournaments/${T(1)}`]],
  ['/organizer/tournaments/[id]/auction', 'organizer', [`/organizer/tournaments/${T(2)}/auction`]],
  ['/organizer/tournaments/[id]/lot', 'organizer', [`/organizer/tournaments/${T(6)}/lot`, `/organizer/tournaments/${T(2)}/lot`]],
  ['/organizer/tournaments/[id]/fixtures', 'organizer', [`/organizer/tournaments/${T(3)}/fixtures`]],
  ['/organizer/tournaments/[id]/participants', 'organizer', [`/organizer/tournaments/${T(1)}/participants`, `/organizer/tournaments/${T(2)}/participants`]],
  ['/organizer/tournaments/[id]/settings', 'organizer', [`/organizer/tournaments/${T(3)}/settings`, `/organizer/tournaments/${T(2)}/settings`]],
  ['/organizer/tournaments/[id]/staff', 'organizer', [`/organizer/tournaments/${T(3)}/staff`]],
  ['/organizer/tournaments/[id]/standings', 'organizer', [`/organizer/tournaments/${T(3)}/standings`]],
  ['/organizer/tournaments/[id]/teams', 'organizer', [`/organizer/tournaments/${T(3)}/teams`, `/organizer/tournaments/${T(2)}/teams`]],
  ['/owner', 'owner', ['/owner']],
  ['/owner/dashboard', 'owner', ['/owner/dashboard']],
  ['/owner/teams/[teamId]', 'owner', [`/owner/teams/${leagueTeam}`, `/owner/teams/${auctionTeam}`]],
  ['/owner/teams/[teamId]/auction', 'owner', [`/owner/teams/${auctionTeam}/auction`]],
  ['/owner/teams/[teamId]/fixtures', 'owner', [`/owner/teams/${leagueTeam}/fixtures`]],
  ['/owner/teams/[teamId]/results', 'owner', [`/owner/teams/${leagueTeam}/results`]],
  ['/owner/teams/[teamId]/players', 'owner', [`/owner/teams/${auctionTeam}/players`]],
  ['/owner/teams/[teamId]/squad', 'owner', [`/owner/teams/${leagueTeam}/squad`, `/owner/teams/${auctionTeam}/squad`]],
  ['/player', 'player', ['/player']],
  ['/player/profile', 'player', ['/player/profile']],
  ['/profile', 'player', ['/profile']],
  ['/scorer', 'scorer', ['/scorer']],
  ['/scorer/matches/[matchId]', 'scorer', [`/scorer/matches/${liveMatch}`]],
  ['/super-admin', 'admin', ['/super-admin']],
  ['/super-admin/approvals', 'admin', ['/super-admin/approvals']],
  ['/super-admin/audit', 'admin', ['/super-admin/audit']],
  ['/super-admin/organizers', 'admin', ['/super-admin/organizers']],
  ['/super-admin/tournaments', 'admin', ['/super-admin/tournaments']],
];

// Warn about pages added to src/app that this list doesn't cover yet.
const pagePatterns = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return pagePatterns(full);
  return entry.name === 'page.tsx' ? ['/' + path.relative('src/app', dir).split(path.sep).filter((s) => s && !s.startsWith('(')).join('/')] : [];
});
const covered = new Set(ROUTES.map(([pattern]) => pattern));
const uncovered = pagePatterns('src/app').filter((p) => !covered.has(p));
if (uncovered.length) console.warn(`Not captured (add to ROUTES): ${uncovered.join(', ')}`);

const fileName = (role, url, width, scheme) =>
  `${role}${url === '/' ? '_home' : url.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{8}([0-9a-f]{4})/g, 'id$1').replace(/[^a-z0-9]+/gi, '_')}__${width}-${scheme}.png`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];
let shots = 0;

for (const role of ['public', ...Object.keys(ACCOUNTS)]) {
  if (only && !ROUTES.some(([, r, urls]) => r === role && urls.some((u) => `${r} ${u}`.includes(only)))) continue;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  if (role !== 'public') {
    await page.goto(`${base}/login`, { waitUntil: 'load' });
    await page.fill('#email', ACCOUNTS[role]);
    await page.fill('#password', password);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type="submit"]')]);
  }
  for (const [, routeRole, urls] of ROUTES) {
    if (routeRole !== role) continue;
    for (const url of urls) {
      if (only && !`${role} ${url}`.includes(only)) continue;
      try {
        const response = await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
        await page.waitForTimeout(1500);
        const status = response?.status() ?? 0;
        const errorText = await page.locator('text=/Application error|Unhandled Runtime Error|This page could not be found/').count();
        if (status >= 400 || errorText) failures.push({ role, url, status, landedOn: new URL(page.url()).pathname });
        for (const scheme of SCHEMES) {
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await page.waitForTimeout(400);
            await page.screenshot({ path: path.join(outDir, fileName(role, url, width, scheme)), fullPage: true });
            shots++;
          }
        }
        console.log(`ok  ${role.padEnd(9)} ${url}${status >= 400 ? ` (HTTP ${status})` : ''}`);
      } catch (error) {
        failures.push({ role, url, error: error.message.split('\n')[0] });
        console.log(`ERR ${role.padEnd(9)} ${url}: ${error.message.split('\n')[0]}`);
      }
    }
  }
  await context.close();
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'failures.json'), JSON.stringify(failures, null, 2));
console.log(`\n${shots} screenshots in ${outDir}; ${failures.length} route(s) failed or showed an error page.`);
