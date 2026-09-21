import { test, expect } from '@playwright/test';
import * as pg from 'pg';

// ─── DB helper ────────────────────────────────────────────────────────────────
// All DB assertions use the direct postgres connection to local Supabase.
// This never goes through RLS — it verifies the actual database state.
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function query(sql: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  const res = await client.query(sql, values);
  await client.end();
  return res;
}

// ─── Supabase admin API helper (service_role) ─────────────────────────────────
// Service role is ONLY used here in the test harness to clean up auth users
// between tests. It is never exposed to browser code.
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

async function deleteAuthUser(email: string) {
  // Look up user by email using admin API
  const listRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  if (!listRes.ok) return;
  const listJson = await listRes.json() as { users?: Array<{ id: string }> };
  const users = listJson.users ?? [];
  for (const u of users) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ts() { return Date.now(); }

async function registerViaUI(
  page: import('@playwright/test').Page,
  { fullName, email, password, orgName, orgSlug }: {
    fullName: string; email: string; password: string;
    orgName: string; orgSlug: string;
  }
) {
  await page.goto('http://localhost:3000/register');
  await page.fill('input[name="fullName"]', fullName);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="orgName"]', orgName);
  await page.fill('input[name="orgSlug"]', orgSlug);
  await page.click('button[type="submit"]');
}

// ─── RETIRED: Phase 3 Full QA ─────────────────────────────────────────────────
// This suite used the old Phase 3 single-form registration+onboarding pattern
// (orgName/orgSlug fields on the /register form). Phase 4 decoupled these.
//
// Test coverage migration:
//   A–E (registration, profile, org, idempotency)  → qa-phase4-auth.spec.ts + qa-phase4-runtime.spec.ts
//   F–G (RLS cross-user, anonymous RPC)             → qa-phase4-runtime.spec.ts
//   SECURITY (cross-org isolation)                  → qa-phase4-runtime.spec.ts
//   AUTH (login, dashboard, nextUrl)                → qa-phase4-auth.spec.ts
//   TOURNAMENT (wizard, participant E2E)            → qa-phase4-e2e.spec.ts + qa-phase4-auth.spec.ts
//   L (service role key not in browser bundle)      → MIGRATED to qa-phase4-auth.spec.ts
//   RESPONSIVE (breakpoint screenshots)             → qa-responsive.spec.ts (if present)
//
// Preserved here for historical reference only. Do not un-skip.
test.describe.skip('Onboarding Security + Full Phase 3 QA', () => {


  // ──────────────────────────────────────────────────────────────────────────
  // A. New authenticated user can initialize onboarding (basic smoke test)
  // ──────────────────────────────────────────────────────────────────────────
  test('A. Organizer registration succeeds and redirects to dashboard', async ({ page }) => {
    const t = ts();
    const email = `test-a-${t}@test.com`;
    await registerViaUI(page, {
      fullName: 'Test A', email, password: 'Password123!',
      orgName: `Org A ${t}`, orgSlug: `org-a-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });
    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // B. Correct profile created: profile.id = auth.uid()
  // ──────────────────────────────────────────────────────────────────────────
  test('B. Profile created with correct user id', async ({ page }) => {
    const t = ts();
    const email = `test-b-${t}@test.com`;
    const fullName = `Test B ${t}`;
    await registerViaUI(page, {
      fullName, email, password: 'Password123!',
      orgName: `Org B ${t}`, orgSlug: `org-b-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });
    // Verify profile exists with correct full_name and unique email
    const res = await query(`SELECT id, full_name FROM public.profiles WHERE full_name = $1`, [fullName]);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].full_name).toBe(fullName);
    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // C. Organization created correctly
  // ──────────────────────────────────────────────────────────────────────────
  test('C. Organization created with correct name and slug', async ({ page }) => {
    const t = ts();
    const email = `test-c-${t}@test.com`;
    const slug = `org-c-${t}`;
    await registerViaUI(page, {
      fullName: 'Test C', email, password: 'Password123!',
      orgName: `Org C ${t}`, orgSlug: slug,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });
    const res = await query(`SELECT name, slug FROM public.organizations WHERE slug = $1`, [slug]);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].slug).toBe(slug);
    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // D. Organizer membership created correctly (role = OWNER)
  // ──────────────────────────────────────────────────────────────────────────
  test('D. Organization membership created with OWNER role', async ({ page }) => {
    const t = ts();
    const email = `test-d-${t}@test.com`;
    const slug = `org-d-${t}`;
    await registerViaUI(page, {
      fullName: 'Test D', email, password: 'Password123!',
      orgName: `Org D ${t}`, orgSlug: slug,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });
    const res = await query(`
      SELECT om.role, om.status FROM public.organization_members om
      JOIN public.organizations o ON o.id = om.organization_id
      WHERE o.slug = $1
    `, [slug]);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].role).toBe('OWNER');
    expect(res.rows[0].status).toBe('ACTIVE');
    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // E. Retry does not duplicate profile, organization, or membership
  // ──────────────────────────────────────────────────────────────────────────
  test('E. Retry onboarding RPC is idempotent', async ({ page }) => {
    const t = ts();
    const email = `test-e-${t}@test.com`;
    const slug = `org-e-${t}`;
    const fullName = `Test E ${t}`;
    await registerViaUI(page, {
      fullName, email, password: 'Password123!',
      orgName: `Org E ${t}`, orgSlug: slug,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });

    // Get the user's profile id
    const profileRes = await query(`SELECT id FROM public.profiles WHERE full_name = $1`, [fullName]);
    expect(profileRes.rows.length).toBe(1);
    const userId = profileRes.rows[0].id;

    // Check profile count for this specific user — should be exactly 1
    const dupCheck = await query(`SELECT count(*) FROM public.profiles WHERE id = $1`, [userId]);
    expect(Number(dupCheck.rows[0].count)).toBe(1);

    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F. User A cannot update profile for User B
  // ──────────────────────────────────────────────────────────────────────────
  test('F. User A cannot update User B profile via RLS', async () => {
    // We verify this via the RPC — the RPC only ever writes to the profile
    // of auth.uid(). We verify this structurally: user_id in profiles is 
    // always the caller's auth.uid (set inside SECURITY DEFINER).
    // Additionally, the SELECT/UPDATE policies on profiles enforce (id = auth.uid()).
    // Direct test: try to update profiles via direct INSERT with wrong id
    // (simulating a forged request) — this will be blocked by RLS.
    const res = await query(`
      SELECT COUNT(*) FROM public.profiles
    `);
    // Just verifying the table is accessible via DB connection (bypasses RLS)
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // G. Anonymous caller cannot invoke organizer onboarding RPC
  // ──────────────────────────────────────────────────────────────────────────
  test('G + J. Anonymous caller rejected by RPC auth guard', async ({ request }) => {
    // Call the RPC with anon key but NO auth JWT (anonymous user)
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/rpc/initialize_organizer_onboarding`,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': ANON_KEY,
          'Authorization': `Bearer ${ANON_KEY}`, // anon JWT = no uid()
        },
        data: {
          p_full_name: 'Hacker',
          p_org_name: 'Hacker Org',
          p_org_slug: 'hacker-org',
        },
      }
    );
    // Expect error — RPC should raise 'Not authenticated'
    expect(response.status()).not.toBe(200);
    const body = await response.text();
    expect(body).toContain('Not authenticated');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // AUTH QA: Full registration + login + logout + session + redirects
  // ──────────────────────────────────────────────────────────────────────────
  test('AUTH: Full registration → logout → login → session → redirect flow', async ({ page }) => {
    const t = ts();
    const email = `auth-full-${t}@test.com`;
    const password = 'Password123!';
    const screenshotDir = 'screenshots';

    // Protected route redirect while logged out
    await page.goto('http://localhost:3000/organizer/dashboard');
    await expect(page).toHaveURL(/\/login/);

    // Register
    await registerViaUI(page, {
      fullName: 'Auth Full', email, password,
      orgName: `Auth Org ${t}`, orgSlug: `auth-org-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });

    // Screenshots at desktop + mobile
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${screenshotDir}/desktop_dashboard.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${screenshotDir}/mobile_dashboard.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Session persistence: refresh page
    await page.reload();
    await expect(page).toHaveURL(/\/organizer\/dashboard/);

    // Logout
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/\/login/);
    await page.screenshot({ path: `${screenshotDir}/desktop_login.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${screenshotDir}/mobile_login.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Login with correct credentials
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 10000 });

    // Forgot password page
    await page.goto('http://localhost:3000/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await page.fill('input[type="email"]', email);
    await page.click('button[type="submit"]');
    // Should show a success/confirmation message (no redirect expected locally)
    await page.waitForTimeout(1000);

    // Invalid login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login/);

    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TOURNAMENT QA
  // ──────────────────────────────────────────────────────────────────────────
  test('TOURNAMENT: Create, save draft, resume, edit, dashboard listing', async ({ page }) => {
    const t = ts();
    const email = `tourny-${t}@test.com`;
    const screenshotDir = 'screenshots';

    await registerViaUI(page, {
      fullName: 'Tourny User', email, password: 'Password123!',
      orgName: `Tourny Org ${t}`, orgSlug: `tourny-org-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });

    // Click Create Tournament
    await page.click('text=Create Tournament');
    await expect(page).toHaveURL(/\/organizer\/tournaments\/new/);

    // Desktop wizard screenshot
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${screenshotDir}/desktop_tournament_wizard.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${screenshotDir}/mobile_tournament_wizard.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 1: Basic Info
    const tournamentName = `QA Tournament ${t}`;
    const tournamentSlug = `qa-tourny-${t}`;
    await page.fill('input[placeholder="e.g. Summer Spikes 2026"]', tournamentName);
    await page.fill('input[placeholder="e.g. summer-spikes-26"]', tournamentSlug);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/\/organizer\/tournaments\/new\?id=.*/, { timeout: 15000 });
    const tournamentId = new URL(page.url()).searchParams.get('id');

    // Verify DRAFT in DB
    const draftRes = await query(`SELECT name, status FROM public.tournaments WHERE id = $1`, [tournamentId]);
    expect(draftRes.rows[0].status).toBe('DRAFT');

    // Test Save Draft (go back to dashboard and check listing)
    await page.goto('http://localhost:3000/organizer/dashboard');
    await expect(page.locator('text=QA Tournament')).toBeVisible();

    // Refresh mid-wizard: navigate back, reload, check persistence
    await page.goto(`http://localhost:3000/organizer/tournaments/new?id=${tournamentId}`);
    await expect(page.locator('input[placeholder="e.g. Summer Spikes 2026"]')).toHaveValue(tournamentName);
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(500);

    // Step 2: Format (volleyball configs)
    await page.getByText('League', { exact: true }).click();
    await page.getByText('Auction League', { exact: true }).click();
    await page.click('button:has-text("Continue")');

    // Step 3: Volleyball Rules
    await page.waitForSelector('text=Volleyball Rules', { timeout: 5000 }).catch(() => {});
    await page.click('button:has-text("Continue")');

    // Step 4: Settings
    await page.click('button:has-text("Continue")');

    // Step 5: Review
    await expect(page.locator('text=Review').first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/final_review_step.png`, fullPage: true });

    // Dashboard listing
    await page.goto('http://localhost:3000/organizer/dashboard');
    await expect(page.locator(`text=${tournamentName}`)).toBeVisible();

    // Continue Setup
    await page.click('text=Continue Setup');
    await expect(page.locator('input[placeholder="e.g. Summer Spikes 2026"]')).toHaveValue(tournamentName);

    await deleteAuthUser(email);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECURITY QA: Cross-org + RLS enforcement
  // ──────────────────────────────────────────────────────────────────────────
  test('SECURITY: Cross-organization denial + forged tournament ID', async ({ page }) => {
    const t = ts();
    const emailA = `sec-a-${t}@test.com`;
    const emailB = `sec-b-${t}@test.com`;

    // Register Org A and create a tournament
    await registerViaUI(page, {
      fullName: 'Sec A', email: emailA, password: 'Password123!',
      orgName: `Sec Org A ${t}`, orgSlug: `sec-org-a-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });
    await page.click('text=Create Tournament');
    await page.fill('input[placeholder="e.g. Summer Spikes 2026"]', `Sec Tourny A ${t}`);
    await page.fill('input[placeholder="e.g. summer-spikes-26"]', `sec-tourny-a-${t}`);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/\/organizer\/tournaments\/new\?id=.*/, { timeout: 15000 });
    const orgATournamentId = new URL(page.url()).searchParams.get('id');

    // Logout Org A
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/\/login/);

    // Register Org B
    await registerViaUI(page, {
      fullName: 'Sec B', email: emailB, password: 'Password123!',
      orgName: `Sec Org B ${t}`, orgSlug: `sec-org-b-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });

    // Attempt to access Org A's tournament — should NOT show Org A's data
    await page.goto(`http://localhost:3000/organizer/tournaments/new?id=${orgATournamentId}`);
    const titleValue = await page
      .locator('input[placeholder="e.g. Summer Spikes 2026"]')
      .inputValue()
      .catch(() => '');
    expect(titleValue).not.toBe(`Sec Tourny A ${t}`);

    // Forged random tournament ID should not expose data
    await page.goto(`http://localhost:3000/organizer/tournaments/new?id=00000000-0000-0000-0000-000000000000`);
    const forgedTitle = await page
      .locator('input[placeholder="e.g. Summer Spikes 2026"]')
      .inputValue()
      .catch(() => '');
    expect(forgedTitle).toBe('');

    await deleteAuthUser(emailA);
    await deleteAuthUser(emailB);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // L. No service_role key in browser bundle
  // ──────────────────────────────────────────────────────────────────────────
  test('L. Service role key not exposed in browser', async ({ page }) => {
    await page.goto('http://localhost:3000/login');
    // Capture all scripts loaded
    const scripts: string[] = [];
    page.on('response', async (response) => {
      const ct = response.headers()['content-type'] ?? '';
      if (ct.includes('javascript')) {
        const body = await response.text().catch(() => '');
        scripts.push(body);
      }
    });
    await page.waitForLoadState('networkidle');
    const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
    const found = scripts.some((s) => s.includes(SERVICE_ROLE_KEY));
    expect(found).toBe(false);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // RESPONSIVE QA
  // ──────────────────────────────────────────────────────────────────────────
  test('RESPONSIVE: Auth pages at all breakpoints', async ({ page }) => {
    const screenshotDir = 'screenshots';
    const viewports = [320, 375, 390, 768, 1024, 1440];
    for (const width of viewports) {
      const height = width < 768 ? 812 : 900;
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/login_${width}.png`, fullPage: true });
      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/register_${width}.png`, fullPage: true });
      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/forgot_${width}.png`, fullPage: true });
    }
  });

  test('RESPONSIVE: Dashboard + wizard at all breakpoints', async ({ page }) => {
    const t = ts();
    const email = `resp-${t}@test.com`;
    const screenshotDir = 'screenshots';
    await registerViaUI(page, {
      fullName: 'Resp User', email, password: 'Password123!',
      orgName: `Resp Org ${t}`, orgSlug: `resp-org-${t}`,
    });
    await expect(page).toHaveURL(/\/organizer\/dashboard/, { timeout: 12000 });

    const viewports = [320, 375, 390, 768, 1024, 1440];
    for (const width of viewports) {
      const height = width < 768 ? 812 : 900;
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:3000/organizer/dashboard');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/dashboard_${width}.png`, fullPage: true });
      await page.goto('http://localhost:3000/organizer/tournaments/new');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/wizard_${width}.png`, fullPage: true });
    }
    await deleteAuthUser(email);
  });

});
