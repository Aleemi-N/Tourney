import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { generate } from '../scripts/gen-types.mjs';

// src/lib/api/types.ts is generated from the migrated database. Run `pnpm db:types` after changing a migration.
test('the generated database types match the database', async () => {
  const current = readFileSync('src/lib/api/types.ts', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current, await generate(), 'src/lib/api/types.ts is out of date: run `pnpm db:types`');
});
