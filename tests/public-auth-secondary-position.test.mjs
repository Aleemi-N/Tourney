import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const publicNav = read('src/components/landing/PublicLandingNav.tsx');
const tournamentPage = read('src/app/(public)/t/[slug]/page.tsx');
const registrationForm = read('src/app/(public)/t/[slug]/register/player/PlayerRegistrationForm.tsx');
const profileForm = read('src/app/(player)/player/profile/ProfileForm.tsx');
const playerCard = read('src/components/player/PlayerCard.tsx');
const participantManager = read('src/app/(organizer)/organizer/tournaments/[id]/participants/ParticipantManager.tsx');
const playerSchema = read('db/migrations/20260920000002_players_and_registrations.sql');
const playerRpcs = read('db/migrations/20260920000017_participant_applications_and_storage.sql');

test('public tournament pages use authoritative server-resolved navigation', () => {
  assert.match(publicNav, /await getUser\(\)/);
  assert.match(publicNav, /<LandingNav/);
  assert.match(tournamentPage, /<PublicLandingNav \/>/);
  assert.doesNotMatch(tournamentPage, /<LandingNav \/>/);
});

for (const [name, form] of [['registration', registrationForm], ['profile', profileForm]]) {
  test(`${name} form keeps secondary optional and rejects duplicate positions`, () => {
    assert.match(form, /Secondary Position \(Optional\)/);
    assert.match(form, /submittedSecondaryPosition === submittedPrimaryPosition/);
    assert.match(form, /Secondary Position must be different from Primary Position/);
    assert.match(form, /if \(secondaryPosition === nextPrimary\) setSecondaryPosition\(''\)/);
    assert.match(form, /position !== primaryPosition/);
  });
}

test('secondary position reaches organizer and shared player cards', () => {
  assert.match(participantManager, /secondary_position: profile\.secondary_position/);
  assert.match(playerCard, /secondary_position\?: string \| null/);
  assert.match(playerCard, /Secondary:/);
});

test('existing schema and trusted RPCs already support optional secondary position', () => {
  assert.match(playerSchema, /secondary_position text/);
  assert.match(playerSchema, /secondary_position IS NULL OR secondary_position IN/);
  assert.match(playerRpcs, /p_secondary_position text DEFAULT NULL/);
  assert.match(playerRpcs, /secondary_position = EXCLUDED\.secondary_position/);
});
