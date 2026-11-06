import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SHARED } from '../scripts/sync-client.mjs';

for (const [from, to] of SHARED) {
  test(`the mobile copy of ${from} matches the web one (run: node scripts/sync-client.mjs)`, () => {
    assert.equal(readFileSync(to, 'utf8'), readFileSync(from, 'utf8'));
  });
}
