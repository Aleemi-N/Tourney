// Prints the anon API key: an HS256 JWT {"role":"anon"} signed with JWT_SECRET, valid for 10 years.
// Usage: JWT_SECRET=... node deploy/make-anon-key.mjs
import { createHmac } from 'node:crypto';
const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) throw new Error('Set JWT_SECRET (32+ characters)');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'anon', iss: 'tourny', iat: now, exp: now + 10 * 365 * 86400 })}`;
console.log(`${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`);
