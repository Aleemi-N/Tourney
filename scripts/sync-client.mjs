// The web app and the mobile app share some files. Edit the web copy, then run this to copy it into mobile/.
// tests/client-sync.test.mjs fails when a copy is out of date.
import { copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SHARED = [
  ['src/lib/api/core.ts', 'mobile/src/lib/client.ts'], // the API client
  ['src/lib/jersey-sheet.ts', 'mobile/src/lib/jersey-sheet.ts'], // the jersey order sheet
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [from, to] of SHARED) {
    copyFileSync(from, to);
    console.log(`copied ${from} -> ${to}`);
  }
}
