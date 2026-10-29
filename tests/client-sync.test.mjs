import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the mobile copy of the API client matches the web one (run: node scripts/sync-client.mjs)', () => {
  assert.equal(readFileSync('mobile/src/lib/client.ts', 'utf8'), readFileSync('src/lib/api/core.ts', 'utf8'));
});
