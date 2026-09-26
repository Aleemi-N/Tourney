import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite: Permanent Dynamic Share Preview & Multi-Tournament Isolation
// ─────────────────────────────────────────────────────────────────────────────

test('1. Canonical origin helper enforces single source of truth', async () => {
  const originModule = await import('../src/lib/origin.ts');
  assert.equal(originModule.TOURNY_PRODUCTION_ORIGIN, 'https://tournyappfyniti.vercel.app');

  const origin = originModule.getCanonicalOrigin();
  assert.equal(origin, 'https://tournyappfyniti.vercel.app');

  assert.equal(
    originModule.getAbsoluteUrl('/t/my-tourny/register/player'),
    'https://tournyappfyniti.vercel.app/t/my-tourny/register/player'
  );
  assert.equal(
    originModule.getAbsoluteUrl('t/my-tourny/register/team'),
    'https://tournyappfyniti.vercel.app/t/my-tourny/register/team'
  );
});

test('2. Registration routes strictly use canonical /register/player and /register/team', () => {
  const regLinks = read('src/app/(organizer)/organizer/tournaments/[id]/RegistrationLinks.tsx');
  const ownerPage = read('src/app/(public)/t/[slug]/register/owner/page.tsx');
  const teamPage = read('src/app/(public)/t/[slug]/register/team/page.tsx');

  // Verify RegistrationLinks uses canonical URLs
  assert.match(regLinks, /\/t\/\$\{slug\}\/register\/player/);
  assert.match(regLinks, /\/t\/\$\{slug\}\/register\/team/);
  assert.doesNotMatch(regLinks, /\/t\/\$\{slug\}\/register\/owner/);

  // Verify native Web Share API support with clipboard fallback
  assert.match(regLinks, /navigator\.share/);
  assert.match(regLinks, /navigator\.clipboard/);

  // Verify /register/owner is strictly an alias redirecting to /register/team
  assert.match(ownerPage, /redirect\(`\/t\/\$\{slug\}\/register\/team`\)/);

  // Verify Team page uses /register/team in login redirect
  assert.match(teamPage, /\/login\?next=\/t\/\$\{slug\}\/register\/team/);
});

test('3. Dynamic OG image route is context-aware and incorporates branding', () => {
  const ogRoute = read('src/app/api/og/tournament/[slug]/route.tsx');

  // Checks context query param
  assert.match(ogRoute, /url\.searchParams\.get\('context'\)/);

  // Checks context badges
  assert.match(ogRoute, /PLAYER REGISTRATION/);
  assert.match(ogRoute, /TEAM REGISTRATION/);
  assert.match(ogRoute, /FIXTURES & SCHEDULE/);
  assert.match(ogRoute, /MATCH RESULTS/);
  assert.match(ogRoute, /STANDINGS/);
  assert.match(ogRoute, /LIVE SCOREBOARD/);

  // Checks branding colors & logo fallback
  assert.match(ogRoute, /tournament\?\.primaryColor/);
  assert.match(ogRoute, /tournament\?\.logoUrl/);
  assert.match(ogRoute, /initials/);
  assert.match(ogRoute, /width: 1200, height: 630/);
});

test('4. All public tournament subpages wire up dynamic metadata builder', () => {
  const fixtures = read('src/app/(public)/t/[slug]/fixtures/page.tsx');
  const results = read('src/app/(public)/t/[slug]/results/page.tsx');
  const table = read('src/app/(public)/t/[slug]/table/page.tsx');
  const teams = read('src/app/(public)/t/[slug]/teams/page.tsx');
  const players = read('src/app/(public)/t/[slug]/players/page.tsx');
  const live = read('src/app/(public)/t/[slug]/live/page.tsx');
  const match = read('src/app/(public)/t/[slug]/match/[matchId]/page.tsx');
  const tv = read('src/app/(public)/t/[slug]/match/[matchId]/tv/page.tsx');

  assert.match(fixtures, /buildTournamentMetadata\(slug, 'fixtures'\)/);
  assert.match(results, /buildTournamentMetadata\(slug, 'results'\)/);
  assert.match(table, /buildTournamentMetadata\(slug, 'table'\)/);
  assert.match(teams, /buildTournamentMetadata\(slug, 'teams'\)/);
  assert.match(players, /buildTournamentMetadata\(slug, 'players'\)/);
  assert.match(live, /buildTournamentMetadata\(slug, 'live'\)/);
  assert.match(match, /buildTournamentMetadata\(slug, 'match'/);
  assert.match(tv, /buildTournamentMetadata\(slug, 'match'/);
});

test('5. Multi-Tournament Isolation (A → B → A sequence)', async () => {
  const originModule = await import('../src/lib/origin.ts');

  // Define two mock tournament datasets representing actual production tournaments
  const TOURNAMENT_A = {
    id: '755a49b0-9d33-4537-aa4c-86aa7f770975',
    name: 'EDAVA VOLLEYBALL  LEAGUE',
    slug: 'edava-volleyball-league',
    description: 'Premier volleyball tournament in Edava.',
    status: 'REGISTRATION',
    format: 'LEAGUE',
    league_mode: 'AUCTION',
    is_public: true,
    logoUrl: 'https://tournyappfyniti.vercel.app/logos/edava.png',
    primaryColor: '#6366f1',
    secondaryColor: '#818cf8',
  };

  const TOURNAMENT_B = {
    id: '9944f7b3-54cc-40ec-939c-067d383b4019',
    name: 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8',
    slug: 'volleyleague',
    description: 'Welcome to Edava Volleyball Club – Pudolz Volleyball League Season 8!',
    status: 'REGISTRATION',
    format: 'LEAGUE',
    league_mode: 'AUCTION',
    is_public: true,
    logoUrl: null,
    primaryColor: '#059669',
    secondaryColor: '#34d399',
  };

  const databaseStore = new Map([
    ['edava-volleyball-league', TOURNAMENT_A],
    ['volleyleague', TOURNAMENT_B],
  ]);

  // Evaluate building metadata for a given tournament record
  function evaluateMetadata(t, context) {
    const registrationOpen = t.status === 'REGISTRATION';
    let path;
    let title;
    let description;
    let ogContext = context;

    switch (context) {
      case 'player':
        path = `/t/${t.slug}/register/player`;
        title = `${t.name} | Player Registration`;
        description = registrationOpen
          ? `Register as a player for ${t.name}.`
          : `Player registration for ${t.name} is currently closed.`;
        ogContext = 'player';
        break;
      case 'team':
      case 'owner':
        path = `/t/${t.slug}/register/team`;
        title = `${t.name} | Team Registration`;
        description = registrationOpen
          ? `Register or apply as a team for ${t.name}.`
          : `Team registration for ${t.name} is currently closed.`;
        ogContext = 'team';
        break;
      case 'fixtures':
        path = `/t/${t.slug}/fixtures`;
        title = `${t.name} | Fixtures & Schedule`;
        description = `Upcoming and scheduled matches for ${t.name}.`;
        ogContext = 'fixtures';
        break;
      case 'tournament':
      default:
        path = `/t/${t.slug}`;
        title = t.name;
        description = t.description?.trim() || `Follow ${t.name}, a volleyball tournament on Tourny.`;
        ogContext = 'tournament';
        break;
    }

    const canonical = new URL(path, originModule.TOURNY_PRODUCTION_ORIGIN);
    const ogImageUrl = new URL(`/api/og/tournament/${t.slug}?context=${ogContext}`, originModule.TOURNY_PRODUCTION_ORIGIN);

    return {
      title: { absolute: title },
      description,
      alternates: { canonical },
      openGraph: {
        title: { absolute: title },
        description,
        url: canonical,
        siteName: 'Tourny',
        type: 'website',
        images: [{ url: ogImageUrl.toString(), width: 1200, height: 630, alt: `${t.name} — ${title}` }],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl.toString()],
      },
    };
  }

  // ── Step 1: Evaluate Tournament A (Player Registration) ──
  const metaA1 = evaluateMetadata(databaseStore.get('edava-volleyball-league'), 'player');
  assert.equal(metaA1.title.absolute, 'EDAVA VOLLEYBALL  LEAGUE | Player Registration');
  assert.equal(metaA1.alternates.canonical.toString(), 'https://tournyappfyniti.vercel.app/t/edava-volleyball-league/register/player');
  assert.equal(metaA1.openGraph.url.toString(), 'https://tournyappfyniti.vercel.app/t/edava-volleyball-league/register/player');
  assert.equal(metaA1.openGraph.images[0].url, 'https://tournyappfyniti.vercel.app/api/og/tournament/edava-volleyball-league?context=player');
  assert.equal(metaA1.twitter.images[0], 'https://tournyappfyniti.vercel.app/api/og/tournament/edava-volleyball-league?context=player');

  // ── Step 2: Evaluate Tournament B (Player Registration) ──
  const metaB = evaluateMetadata(databaseStore.get('volleyleague'), 'player');
  assert.equal(metaB.title.absolute, 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8 | Player Registration');
  assert.equal(metaB.alternates.canonical.toString(), 'https://tournyappfyniti.vercel.app/t/volleyleague/register/player');
  assert.equal(metaB.openGraph.url.toString(), 'https://tournyappfyniti.vercel.app/t/volleyleague/register/player');
  assert.equal(metaB.openGraph.images[0].url, 'https://tournyappfyniti.vercel.app/api/og/tournament/volleyleague?context=player');
  assert.equal(metaB.twitter.images[0], 'https://tournyappfyniti.vercel.app/api/og/tournament/volleyleague?context=player');

  // Strict negative assertions: B must NEVER contain A's slug or name
  assert.doesNotMatch(metaB.title.absolute, /EDAVA VOLLEYBALL  LEAGUE/);
  assert.doesNotMatch(metaB.alternates.canonical.toString(), /edava-volleyball-league/);
  assert.doesNotMatch(metaB.openGraph.url.toString(), /edava-volleyball-league/);
  assert.doesNotMatch(metaB.openGraph.images[0].url, /edava-volleyball-league/);
  assert.doesNotMatch(metaB.twitter.images[0], /edava-volleyball-league/);

  // ── Step 3: Re-evaluate Tournament A (Player Registration) ──
  const metaA2 = evaluateMetadata(databaseStore.get('edava-volleyball-league'), 'player');
  assert.deepEqual(metaA1, metaA2, 'Tournament A metadata must remain pure and identical after evaluating Tournament B');

  // Strict negative assertions: A must NEVER contain B's slug or name
  assert.doesNotMatch(metaA2.title.absolute, /PUDOLZ/);
  assert.doesNotMatch(metaA2.alternates.canonical.toString(), /volleyleague/);
  assert.doesNotMatch(metaA2.openGraph.url.toString(), /volleyleague/);
  assert.doesNotMatch(metaA2.openGraph.images[0].url, /volleyleague/);

  // ── Step 4: Verify Team Registration URLs ──
  const teamA = evaluateMetadata(databaseStore.get('edava-volleyball-league'), 'team');
  const teamB = evaluateMetadata(databaseStore.get('volleyleague'), 'team');

  assert.equal(teamA.title.absolute, 'EDAVA VOLLEYBALL  LEAGUE | Team Registration');
  assert.equal(teamA.alternates.canonical.toString(), 'https://tournyappfyniti.vercel.app/t/edava-volleyball-league/register/team');
  assert.equal(teamA.openGraph.images[0].url, 'https://tournyappfyniti.vercel.app/api/og/tournament/edava-volleyball-league?context=team');

  assert.equal(teamB.title.absolute, 'PUDOLZ VOLLEYBALL LEAGUE - SEASON 8 | Team Registration');
  assert.equal(teamB.alternates.canonical.toString(), 'https://tournyappfyniti.vercel.app/t/volleyleague/register/team');
  assert.equal(teamB.openGraph.images[0].url, 'https://tournyappfyniti.vercel.app/api/og/tournament/volleyleague?context=team');

  assert.notEqual(teamA.alternates.canonical.toString(), teamB.alternates.canonical.toString());
  assert.doesNotMatch(teamB.alternates.canonical.toString(), /owner/);
  assert.doesNotMatch(teamB.alternates.canonical.toString(), /edava/);
});
