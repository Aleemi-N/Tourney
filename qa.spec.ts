import { test, expect } from '@playwright/test';
import { resolve } from 'path';

// SKIPPED: Phase 3 QA tests written for single-form registration+onboarding flow.
// Phase 4 decoupled registration from onboarding. These are superseded by:
//   - qa-phase4-auth.spec.ts  (auth flows)
//   - qa-phase4-e2e.spec.ts   (full participant E2E)
// Preserved here for reference only.
test.describe.skip('Phase 3 QA', () => {
  const screenshotDir = resolve(process.cwd(), 'screenshots');


  test('AUTH QA: Registration, Login, and Protected Routes', async ({ page }) => {
    // Navigate to protected route unauthenticated
    await page.goto('http://localhost:3000/organizer/dashboard');
    await expect(page).toHaveURL(/.*\/login/);
    await page.screenshot({ path: `${screenshotDir}/mobile_login.png`, fullPage: true });

    // Navigate to register
    await page.goto('http://localhost:3000/register');
    const timestamp = Date.now();
    const testEmail = `organizer${timestamp}@test.com`;
    const testPassword = 'Password123!';
    const testOrgName = `Test Org ${timestamp}`;

    // Fill registration
    await page.fill('input[name="fullName"]', 'Test Organizer');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.fill('input[name="orgName"]', testOrgName);
    await page.fill('input[name="orgSlug"]', `test-org-${timestamp}`);
    
    await page.click('button[type="submit"]');
    
    // Check if registration redirects to dashboard
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });
    
    // Mobile dashboard screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${screenshotDir}/mobile_dashboard.png`, fullPage: true });

    // Desktop dashboard screenshot
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${screenshotDir}/desktop_dashboard.png`, fullPage: true });

    // Logout
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/.*\/login/);

    // Desktop login screenshot
    await page.screenshot({ path: `${screenshotDir}/desktop_login.png`, fullPage: true });

    // Login with the created account
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });
  });

  test('TOURNAMENT WIZARD QA', async ({ page }) => {
    // Login with a fresh test account
    const timestamp = Date.now();
    const testEmail = `orgwizard${timestamp}@test.com`;
    await page.goto('http://localhost:3000/register');
    await page.fill('input[name="fullName"]', 'Wizard Tester');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="orgName"]', 'Wizard Org');
    await page.fill('input[name="orgSlug"]', `wizard-org-${timestamp}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    // Click Create Tournament
    await page.click('text=Create Tournament');
    await expect(page).toHaveURL(/.*\/organizer\/tournaments\/new/);

    // Desktop wizard screenshot
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${screenshotDir}/desktop_tournament_wizard.png`, fullPage: true });

    // Mobile wizard screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${screenshotDir}/mobile_tournament_wizard.png`, fullPage: true });

    // Switch back to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    // Step 1: Basic Info
    await page.fill('input[placeholder="e.g. Summer Spikes 2026"]', 'QA Test Tournament');
    await page.fill('input[placeholder="e.g. summer-spikes-26"]', `qa-test-${Date.now()}`);
    await page.click('button:has-text("Continue")');

    // Wait for URL to have ?id= indicating save success
    await expect(page).toHaveURL(/.*\/organizer\/tournaments\/new\?id=.*/);

    // Step 2: Format
    await expect(page.locator('text=Format').first()).toBeVisible();
    await page.click('text=League');
    await page.click('text=Auction League');
    await page.click('button:has-text("Continue")');

    // Step 3: Rules
    await expect(page.locator('text=Volleyball Rules').first()).toBeVisible();
    await page.selectOption('select', '3'); // Best of 5
    await page.click('button:has-text("Continue")');

    // Step 4: Settings
    await expect(page.locator('text=Settings').first()).toBeVisible();
    await page.fill('input[type="number"] >> nth=0', '8');
    await page.click('button:has-text("Continue")');

    // Step 5: Review
    await expect(page.locator('text=Review & Publish').first()).toBeVisible();
    
    // Screenshot of final review
    await page.screenshot({ path: `${screenshotDir}/final_review_step.png`, fullPage: true });

    // Test that the draft is persisted to dashboard
    await page.goto('http://localhost:3000/organizer/dashboard');
    await expect(page.locator('text=Drafts in Progress')).toBeVisible();
    await expect(page.locator('text=QA Test Tournament')).toBeVisible();

    // Click Continue Setup
    await page.click('text=Continue Setup');
    // Ensure it loads the draft data
    await expect(page.locator('input[placeholder="e.g. Summer Spikes 2026"]')).toHaveValue('QA Test Tournament');
  });
});
