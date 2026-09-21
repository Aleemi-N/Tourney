import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Local Supabase service role key (safe: local dev only, never committed to prod)
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const adminClient = createClient(supabaseUrl, serviceRoleKey);

/**
 * Helper: create a confirmed user via admin API and sign them in via browser UI.
 * Returns after the browser has an active session and is at the expected post-login URL.
 */
async function createAndSignIn(
  page: Page,
  email: string,
  password: string,
  opts: { nextUrl?: string; waitForUrl?: string | RegExp } = {}
) {
  // 1. Create user via admin (email confirmed, no email flow)
  await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split('@')[0] },
  });

  // 2. Sign in via browser UI so session cookies are set
  const loginUrl = opts.nextUrl
    ? `http://localhost:3000/login?next=${encodeURIComponent(opts.nextUrl)}`
    : 'http://localhost:3000/login';
  await page.goto(loginUrl);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  if (opts.waitForUrl) {
    await page.waitForURL(opts.waitForUrl, { timeout: 15000 });
  } else {
    await page.waitForURL('http://localhost:3000/', { timeout: 15000 });
  }
}

test.describe('Phase 4 - Auth & UX Pass', () => {
  test('Health endpoint returns 200 OK', async ({ request }) => {
    const response = await request.get('http://localhost:3000/api/health');
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('General account creation does not force organizer onboarding', async ({ page }) => {
    const runId = Date.now();
    const email = `auth1_${runId}@test.local`;
    const password = 'Password123!';

    // Create confirmed user and sign in to the browser
    await createAndSignIn(page, email, password);

    // Must land on home, NOT organizer onboarding
    expect(page.url()).toBe('http://localhost:3000/');

    // Landing nav must show Sign Out (logged in)
    // Click avatar to reveal dropdown
    await page.getByRole('button', { expanded: false }).first().click();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible({
      timeout: 10000,
    });

    // Dashboard link must NOT appear — not an organizer
    await expect(page.getByRole('link', { name: 'Dashboard' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'My Tournaments' })).not.toBeVisible();
  });

  test('Malicious nextUrl is blocked during login', async ({ page }) => {
    const runId = Date.now();
    const email = `auth2_${runId}@test.local`;
    const password = 'Password123!';

    // Create confirmed user
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    // Attempt login with malicious nextUrl
    await page.goto('http://localhost:3000/login?next=https://evil.example.com');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // Must fallback to home
    await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
    expect(page.url()).not.toContain('evil.example');
  });

  test('Valid nextUrl is respected during login and onboarding preserves it', async ({
    page,
  }) => {
    const runId = Date.now();
    const email = `auth3_${runId}@test.local`;
    const password = 'Password123!';

    // Create confirmed user (non-organizer)
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    // Sign in with next=/organizer/tournaments/new
    await page.goto(
      'http://localhost:3000/login?next=%2Forganizer%2Ftournaments%2Fnew'
    );
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // /organizer/tournaments/new redirects to onboarding (no org yet)
    await page.waitForURL(/.*organizer\/onboarding.*/, { timeout: 15000 });

    // Complete onboarding — slug must be unique per test run
    await page.fill('input[name="orgName"]', `Org ${runId}`);
    await page.fill('input[name="orgSlug"]', `test-org-${runId}`);
    await page.click('button[type="submit"]');

    // Onboarding must restore the preserved next URL
    await page.waitForURL(/.*organizer\/tournaments\/new.*/, { timeout: 15000 });
  });

  test('Organizer dashboard shows Back to Tourny link in sidebar', async ({ page }) => {
    const runId = Date.now();
    const email = `auth4_${runId}@test.local`;
    const password = 'Password123!';

    // 1. Create confirmed organizer user via admin
    const {
      data: { user },
    } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Auth Test Organizer' },
    });
    if (!user) throw new Error('Failed to create test user');

    // 2. Insert profile (required FK for organization creation)
    await adminClient
      .from('profiles')
      .upsert({ id: user.id, full_name: 'Auth Test Organizer', email });

    // 3. Call onboarding RPC via admin (bypasses auth check by using anon client logged in)
    const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await anonClient.auth.signInWithPassword({ email, password });
    const { error: rpcError } = await anonClient.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Auth Test Organizer',
      p_org_name: `Test Org ${runId}`,
      p_org_slug: `sidebar-org-${runId}`,
    });
    if (rpcError) throw new Error(`Onboarding RPC failed: ${rpcError.message}`);

    // 4. Sign in via browser UI
    await createAndSignIn(page, email, password, {
      nextUrl: '/organizer/dashboard',
      waitForUrl: /.*organizer\/dashboard.*/,
    });

    // 5. Back to Tourny link must be visible in sidebar
    await expect(
      page.getByRole('link', { name: 'Back to Tourny' })
    ).toBeVisible({ timeout: 10000 });
  });

  test('Forgot Password page renders and accepts email submission', async ({ page }) => {
    await page.goto('http://localhost:3000/forgot-password');
    await expect(
      page.getByRole('heading', { name: 'Reset Password' })
    ).toBeVisible();

    await page.fill('input[name="email"]', 'someuser@example.com');
    await page.click('button[type="submit"]');

    await expect(page.getByText('Check your email')).toBeVisible({ timeout: 5000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECURITY: Service role key must never appear in client-side JS bundles.
  // Migrated from qa-phase3-full.spec.ts test L (that suite was retired in Phase 4).
  // ──────────────────────────────────────────────────────────────────────────
  test('Service role key is not exposed in browser JavaScript bundles', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', async (response) => {
      const ct = response.headers()['content-type'] ?? '';
      if (ct.includes('javascript')) {
        const body = await response.text().catch(() => '');
        scripts.push(body);
      }
    });

    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    // Local demo service role key — this must never appear in browser-side bundles
    const SERVICE_ROLE_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

    const found = scripts.some((s) => s.includes(SERVICE_ROLE_KEY));
    expect(found, 'Service role key must NOT appear in any JavaScript bundle served to the browser').toBe(false);
  });
});
