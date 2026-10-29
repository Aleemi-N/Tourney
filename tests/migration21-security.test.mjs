import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../db/migrations/20260921000021_tournament_staff_and_branding.sql', import.meta.url),
  'utf8',
);
const serverHelper = readFileSync(new URL('../src/lib/api/server.ts', import.meta.url), 'utf8');

test('organizer authorization explicitly requires an active organizer role', () => {
  assert.match(serverHelper, /\.eq\('role', 'ORGANIZER'\)/);
  assert.match(serverHelper, /\.eq\('status', 'ACTIVE'\)/);
});

test('staff RPCs are authenticated-only and role-limited', () => {
  for (const signature of [
    'get_tournament_staff(uuid)',
    'add_tournament_staff_role(uuid, text, text)',
    'remove_tournament_staff_role(uuid, uuid, text)',
  ]) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')} FROM PUBLIC`));
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')} FROM anon`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${signature.replace(/[()]/g, '\\$&')} TO authenticated`));
  }
  assert.match(migration, /upper\(p_role\) NOT IN \('ORGANIZER', 'SCORER'\)/);
});

test('email resolution is exact, normalized, and ambiguity fails closed', () => {
  assert.match(migration, /lower\(btrim\(email\)\) = v_email/);
  assert.match(migration, /v_match_count > 1/);
  assert.match(migration, /AMBIGUOUS_EMAIL/);
  assert.doesNotMatch(migration, /LIMIT 1/i);
});

test('primary organizer removal is blocked in trusted database logic', () => {
  assert.match(migration, /p_target_user_id = v_primary/);
  assert.match(migration, /PRIMARY_ORGANIZER_PROTECTED/);
});

test('membership mutations are audited and direct writes are revoked', () => {
  assert.match(migration, /_ROLE_GRANTED/);
  assert.match(migration, /_ROLE_REMOVED/);
  assert.match(migration, /DROP POLICY IF EXISTS "Organizers can manage tournament members"/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.tournament_members FROM anon, authenticated/);
});

test('tournament logos are tournament-scoped and organizer-authorized', () => {
  assert.match(migration, /v_logo_path NOT LIKE p_tournament_id::text \|\| '\/%'/);
  assert.match(migration, /Organizers can upload tournament logos/);
  assert.match(migration, /public\.is_tournament_organizer\(t\.id\)/);
});
