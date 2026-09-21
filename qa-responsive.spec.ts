import { test, expect } from '@playwright/test';
import { resolve } from 'path';

// SKIPPED: Phase 3 responsive QA uses old single-form registration pattern. Superseded by qa-phase4-auth.spec.ts.
test.describe.skip('Phase 3 QA Responsive', () => {
  const screenshotDir = resolve(process.cwd(), 'screenshots');

  const viewports = [
    { width: 320, height: 568 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 }
  ];

  test('Responsive QA - Login, Register, Forgot Password', async ({ page }) => {
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      
      await page.goto('http://localhost:3000/login');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/login_${vp.width}.png`, fullPage: true });

      await page.goto('http://localhost:3000/register');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/register_${vp.width}.png`, fullPage: true });

      await page.goto('http://localhost:3000/forgot-password');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/forgot-password_${vp.width}.png`, fullPage: true });
    }
  });

  test('Responsive QA - Dashboard & Wizard', async ({ page }) => {
    const timestamp = Date.now();
    const testEmail = `responsive${timestamp}@test.com`;
    await page.goto('http://localhost:3000/register');
    await page.fill('input[name="fullName"]', 'Responsive Tester');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="orgName"]', 'Resp Org');
    await page.fill('input[name="orgSlug"]', `resp-org-${timestamp}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('http://localhost:3000/organizer/dashboard');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/dashboard_${vp.width}.png`, fullPage: true });
      
      await page.goto('http://localhost:3000/organizer/tournaments/new');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: `${screenshotDir}/wizard_${vp.width}.png`, fullPage: true });
    }
  });

  test('Responsive QA - Phase 4 Participant Portals', async ({ page }) => {
    // We assume there's some layout state available, or we just load the pages.
    // If auth is required, we use a mocked/login state or just hit the routes.
    // However, without a tournament, /register/player shows "Tournament not found", which is still a valid smoke test for layout.
    // To do this right, we just screenshot the login redirect or the not found states, or we could login.
    // For smoke testing layout without blowing up test complexity, we'll just capture the routes.
    const routes = [
      'http://localhost:3000/player/profile',
      'http://localhost:3000/owner/dashboard',
      'http://localhost:3000/t/test/register/player',
      'http://localhost:3000/organizer/tournaments/00000000-0000-0000-0000-000000000000/participants'
    ];
    
    for (const vp of viewports) {
      await page.setViewportSize(vp);
      for (const route of routes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const name = route.split('/').pop() || 'index';
        await page.screenshot({ path: `${screenshotDir}/phase4_${name}_${vp.width}.png`, fullPage: true });
      }
    }
  });
});
