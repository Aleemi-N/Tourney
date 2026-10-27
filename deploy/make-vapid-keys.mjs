#!/usr/bin/env node
// Makes the VAPID key pair that lets the API send web push notifications to browsers.
//   node deploy/make-vapid-keys.mjs
// Put the output in deploy/.env. Keep the private key secret; the public key is not secret (the website needs it).
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const b64 = (s) => Buffer.from(s, 'base64url');
const point = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]); // uncompressed public point, 65 bytes

console.log(`VAPID_PUBLIC_KEY=${point.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('VAPID_SUBJECT=mailto:you@example.com   # an address browsers vendors can reach you on');
