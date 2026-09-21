import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const metadata = read('src/lib/public-tournament-metadata.ts');
const publicPage = read('src/app/(public)/t/[slug]/page.tsx');
const playerPage = read('src/app/(public)/t/[slug]/register/player/page.tsx');
const ownerPage = read('src/app/(public)/t/[slug]/register/team/page.tsx');
const ogImage = read('src/app/api/og/tournament/[slug]/route.tsx');
const manager = read('src/app/(organizer)/organizer/tournaments/[id]/participants/ParticipantManager.tsx');
const reviewCard = read('src/components/player/PlayerReviewCard.tsx');
const actions = read('src/app/actions/participants.ts');
const rootLayout = read('src/app/layout.tsx');
const proxy = read('src/proxy.ts');

test('public tournament and registration metadata is dynamic, absolute, and crawler-safe', () => {
  assert.match(publicPage, /buildTournamentMetadata\(slug, 'tournament'\)/);
  assert.match(playerPage, /buildTournamentMetadata\(slug, 'player'\)/);
  assert.match(ownerPage, /buildTournamentMetadata\(slug, 'owner'\)/);
  assert.match(metadata, /https:\/\/tournyappfyniti\.vercel\.app/);
  assert.match(rootLayout, /metadataBase: new URL\('https:\/\/tournyappfyniti\.vercel\.app'\)/);
  assert.match(metadata, /alternates: \{ canonical \}/);
  assert.match(metadata, /siteName: 'Tourny'/);
  assert.match(metadata, /card: 'summary_large_image'/);
  assert.match(metadata, /status === 'REGISTRATION'/);
  assert.doesNotMatch(metadata, /auth\.getUser/);
  assert.doesNotMatch(proxy, /register\\\/\(player\|team\)/);
});

test('dynamic share card is 1200x630 and supports tournament logo plus fallback', () => {
  assert.match(ogImage, /width: 1200, height: 630/);
  assert.match(ogImage, /tournament\?\.logoUrl/);
  assert.match(ogImage, /REGISTRATION OPEN/);
  assert.match(ogImage, /Tourny Volleyball/);
});

test('participant controls only render for actionable statuses', () => {
  assert.match(manager, /\['PENDING', 'CHANGES_REQUESTED'\]\.includes\(p\.status\)/);
  assert.match(manager, /\['PENDING', 'CHANGES_REQUESTED'\]\.includes\(o\.status\)/);
  assert.match(reviewCard, /status === 'PENDING' \|\| status === 'CHANGES_REQUESTED'/);
  assert.doesNotMatch(manager, /alert\(/);
  assert.doesNotMatch(manager, /confirm\(/);
});

test('participant action errors are sanitized and stale state triggers refresh', () => {
  assert.match(actions, /This \$\{subject\} is already rejected/);
  assert.match(actions, /Unable to update this \$\{subject\}/);
  assert.doesNotMatch(actions, /return \{ error: error\.message \}/);
  assert.match(manager, /setMessage\(\{ type: 'error', text: res\.error \}\);\s*router\.refresh\(\)/);
});
