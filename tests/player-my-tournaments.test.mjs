import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profilePage = await readFile(new URL('../src/app/(account)/profile/page.tsx', import.meta.url), 'utf8');
const landingNav = await readFile(new URL('../src/components/landing/LandingNav.tsx', import.meta.url), 'utf8');

test('player tournament discovery is scoped to the authenticated player profile', () => {
  assert.match(profilePage, /\.eq\('user_id', user\.id\)/);
  assert.match(profilePage, /\.eq\('player_id', playerProfile\.id\)/);
  assert.match(profilePage, /player_tournament_registrations/);
  assert.doesNotMatch(profilePage, /\.eq\('status', 'APPROVED'\);\s*playerRegistrations/);
});

test('all supported authoritative registration states have player-facing presentation', () => {
  for (const status of ['PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'WITHDRAWN']) {
    assert.match(profilePage, new RegExp(`${status}:`));
  }
  assert.match(profilePage, /Registration Pending/);
  assert.match(profilePage, /Registration Rejected/);
  assert.match(profilePage, /Changes Requested/);
});

test('multi-role tournaments are merged and expose contextual actions without leaking review notes', () => {
  assert.match(profilePage, /participationMap = new Map/);
  assert.match(profilePage, /auctionCategory: r\.auction_category/);
  assert.match(profilePage, /View Tournament/);
  assert.match(profilePage, /Open Dashboard/);
  assert.doesNotMatch(profilePage, /review_notes/);
});

test('authenticated navigation exposes one general My Tournaments hub and a distinct organizer dashboard', () => {
  assert.match(landingNav, /href="\/profile#my-tournaments"/);
  assert.match(landingNav, /Organizer Dashboard/);
  assert.match(landingNav, />\s*My Tournaments\s*</);
});
