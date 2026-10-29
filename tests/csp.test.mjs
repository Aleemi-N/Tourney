import assert from 'node:assert/strict';
import test from 'node:test';
import { contentSecurityPolicy } from '../src/lib/csp.ts';

const policy = (pathname, extra = {}) => contentSecurityPolicy({ nonce: 'abc123', pathname, apiUrl: 'https://api.example.com', ...extra });

test('scripts need this request\'s nonce; inline and eval scripts are not allowed in production', () => {
  const script = policy('/').split('; ').find((d) => d.startsWith('script-src'));
  assert.match(script, /'nonce-abc123'/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
  assert.match(policy('/', { development: true }), /script-src[^;]*'unsafe-eval'/); // React's development tooling
});

test('the page may talk to its own API (http and websocket) and show its images, and nothing else', () => {
  const p = policy('/');
  assert.match(p, /connect-src 'self' https:\/\/api\.example\.com wss:\/\/api\.example\.com/);
  assert.match(p, /img-src 'self' data: blob: https:\/\/api\.example\.com/);
  assert.match(p, /default-src 'self'/);
  assert.match(p, /object-src 'none'/);
  assert.match(p, /base-uri 'self'/);
  assert.match(p, /form-action 'self'/);
  assert.match(p, /upgrade-insecure-requests/);
  assert.doesNotMatch(contentSecurityPolicy({ nonce: 'n', pathname: '/', apiUrl: 'http://localhost:8080' }), /upgrade-insecure-requests/);
  assert.match(contentSecurityPolicy({ nonce: 'n', pathname: '/', apiUrl: 'http://localhost:8080' }), /connect-src 'self' http:\/\/localhost:8080 ws:\/\/localhost:8080/);
});

test('only the embeddable widgets may be framed by other sites', () => {
  assert.match(policy('/t/spring-cup'), /frame-ancestors 'self'/);
  assert.match(policy('/embed/t/spring-cup/table'), /frame-ancestors \*/);
  assert.match(policy('/embed'), /frame-ancestors \*/);
  assert.match(policy('/embedded-fake'), /frame-ancestors 'self'/);
});
