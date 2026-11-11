// Checks a deployed Tourny like a visitor would, step by step, and keeps going after a failure so every problem is listed.
// Run after each deploy:  WEB=https://tourny.example.com API=https://tourny-api.example.com node tests/live-check.mjs [screenshot folder]
// Creates one test account and organization each run (example.com addresses): clear them before real data arrives.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { chromium } = require('@playwright/test');
const WEB = process.env.WEB ?? 'https://tourny.appfyniti.com', API = process.env.API ?? 'https://tourny-api.appfyniti.com';
const OUT = process.argv[2] ?? (await import('node:os')).tmpdir();
const stamp = Date.now().toString(36);
const EMAIL = `live-check-${stamp}@example.com`, PW = 'Live-Check-2026!';
const results = [];
const problems = [];
const step = async (name, fn) => {
  try { const note = await fn(); results.push(`PASS  ${name}${note ? ` (${note})` : ''}`); }
  catch (e) { results.push(`FAIL  ${name}: ${String(e.message).split('\n')[0].slice(0, 200)}`); }
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => problems.push(`page error: ${e.message.slice(0, 160)}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 160)}`); });
page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

await step('API health', async () => { const r = await fetch(`${API}/actuator/health`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return (await r.json()).status; });
await step('API allows the website (CORS)', async () => {
  const r = await fetch(`${API}/rest/tournaments?select=id&limit=1`, { method: 'OPTIONS', headers: { Origin: WEB, 'Access-Control-Request-Method': 'GET' } });
  const allowed = r.headers.get('access-control-allow-origin');
  if (allowed !== WEB) throw new Error(`allow-origin is ${allowed}`);
});
await step('API refuses other websites (CORS)', async () => {
  const r = await fetch(`${API}/rest/tournaments?select=id&limit=1`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' } });
  if (r.headers.get('access-control-allow-origin')) throw new Error('another origin was allowed');
});
await step('live updates connect (websocket through Cloudflare)', async () => {
  const ws = new WebSocket(`${API.replace('https', 'wss')}/realtime/websocket?vsn=2.0.0`);
  const reply = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no answer in 10 s')), 10000);
    ws.onopen = () => ws.send(JSON.stringify(['1', '1', 'realtime:check', 'phx_join', { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'matches', filter: 'id=eq.00000000-0000-0000-0000-000000000000' }] } }]));
    ws.onmessage = (m) => { clearTimeout(t); resolve(JSON.parse(m.data)); };
    ws.onerror = () => { clearTimeout(t); reject(new Error('websocket error')); };
  });
  ws.close();
  if (reply[4]?.status !== 'ok') throw new Error(JSON.stringify(reply).slice(0, 120));
});

for (const path of ['/', '/tournaments', '/login', '/register', '/forgot-password', '/privacy', '/terms']) {
  await step(`page ${path}`, async () => {
    const r = await page.goto(WEB + path, { waitUntil: 'load' });
    if (!r || r.status() >= 400) throw new Error(`HTTP ${r?.status()}`);
  });
}
await page.screenshot({ path: `${OUT}/live-terms.png` });

await step('sign up on the website', async () => {
  await page.goto(`${WEB}/register`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.fill('#fullName', 'Live Check'); await page.fill('#email', EMAIL); await page.fill('#password', PW);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  const url = new URL(page.url());
  const msg = await page.locator('[role="alert"], .text-danger, .text-red-500').first().textContent().catch(() => null);
  await page.screenshot({ path: `${OUT}/live-signup.png` });
  if (!url.pathname.startsWith('/player')) throw new Error(`stayed on ${url.pathname}${msg ? `: "${msg.trim()}"` : ''}`);
  return 'landed in the player portal';
});
await step('sign in with the new account', async () => {
  await ctx.clearCookies();
  await page.goto(`${WEB}/login`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.fill('#email', EMAIL); await page.fill('#password', PW);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }), page.click('button[type="submit"]')]);
  const cookies = await ctx.cookies();
  const refresh = cookies.find((c) => c.name === 'tourny-refresh');
  if (!refresh?.httpOnly || !refresh.secure) throw new Error('refresh cookie is not HttpOnly + Secure');
  return `at ${new URL(page.url()).pathname}, cookies HttpOnly + Secure`;
});
await step('organizer setup: the browser blocks a bad slug', async () => {
  await page.goto(`${WEB}/organizer/onboarding?next=/organizer/tournaments/new`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.fill('input[name="orgName"]', 'Live Check Org'); await page.fill('input[name="orgSlug"]', 'Bad.Slug');
  const message = await page.locator('input[name="orgSlug"]').evaluate((el) => (el.checkValidity(), el.validationMessage));
  if (!message) throw new Error('the browser accepted Bad.Slug');
  return `browser says: "${message.slice(0, 60)}"`;
});
await step('organizer setup: the server explains a bad slug that got past the browser', async () => {
  await page.locator('input[name="orgSlug"]').evaluate((el) => el.removeAttribute('pattern'));
  await page.getByRole('button', { name: 'Create Organization' }).click(); await page.waitForTimeout(3000);
  const text = await page.locator('body').innerText();
  if (/Internal error/i.test(text)) throw new Error('shows "Internal error"');
  const line = text.split(String.fromCharCode(10)).find((l) => /lowercase/i.test(l));
  if (!line) throw new Error('no clear message');
  return `"${line.trim().slice(0, 80)}"`;
});
await step('organizer setup with a good slug', async () => {
  await page.fill('input[name="orgName"]', 'Live Check Org'); await page.fill('input[name="orgSlug"]', `live-check-${stamp}`);
  await Promise.all([page.waitForURL((u) => !u.pathname.includes('onboarding'), { timeout: 30000 }), page.getByRole('button', { name: 'Create Organization' }).click()]);
  await page.screenshot({ path: `${OUT}/live-after-org.png` });
  return `now at ${new URL(page.url()).pathname}`;
});
await step('tournament wizard opens', async () => {
  await page.goto(`${WEB}/organizer/tournaments/new`, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  await page.getByPlaceholder('e.g. Summer Spikes 2026').waitFor({ timeout: 15000 });
});

console.log(results.join('\n'));
console.log(problems.length ? `\nProblems seen in the browser:\n- ${[...new Set(problems)].join('\n- ')}` : '\nNo page errors, console errors or server errors seen.');
await browser.close();
