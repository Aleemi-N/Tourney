// The web app and the mobile app share one API client. Edit src/lib/api/core.ts, then run this to copy it into mobile/.
// tests/client-sync.test.mjs fails when the copy is out of date.
import { copyFileSync } from 'node:fs';
copyFileSync('src/lib/api/core.ts', 'mobile/src/lib/client.ts');
console.log('copied src/lib/api/core.ts -> mobile/src/lib/client.ts');
