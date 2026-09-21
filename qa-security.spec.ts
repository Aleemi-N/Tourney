import { test, expect } from '@playwright/test';

// SKIPPED: Uses Phase 3 single-form registration+onboarding pattern (orgName/orgSlug on register form).
// Phase 4 decoupled these. Cross-org security is verified at DB/RLS level in qa-phase4-runtime.spec.ts.
test.describe.skip('Security QA', () => {
  test('Cross-organization / security QA', async ({ page }) => {

    // 1. Create org A
    const timestampA = Date.now();
    const orgA_Email = `orga${timestampA}@test.com`;
    await page.goto('http://localhost:3000/register');
    await page.fill('input[name="fullName"]', 'Org A');
    await page.fill('input[name="email"]', orgA_Email);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="orgName"]', 'Org A');
    await page.fill('input[name="orgSlug"]', `orga-${timestampA}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    // Extract tournament ID after creating a draft for Org A
    await page.click('text=Create Tournament');
    await expect(page).toHaveURL(/.*\/organizer\/tournaments\/new/);
    await page.fill('input[placeholder="e.g. Summer Spikes 2026"]', 'Org A Tournament');
    await page.fill('input[placeholder="e.g. summer-spikes-26"]', `orga-tourny-${Date.now()}`);
    await page.click('button:has-text("Continue")');
    await expect(page).toHaveURL(/.*\/organizer\/tournaments\/new\?id=.*/);
    const urlA = page.url();
    const tournamentId = new URL(urlA).searchParams.get('id');
    expect(tournamentId).toBeTruthy();

    // Logout
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/.*\/login/);

    // 2. Create org B
    const timestampB = Date.now();
    const orgB_Email = `orgb${timestampB}@test.com`;
    await page.goto('http://localhost:3000/register');
    await page.fill('input[name="fullName"]', 'Org B');
    await page.fill('input[name="email"]', orgB_Email);
    await page.fill('input[name="password"]', 'Password123!');
    await page.fill('input[name="orgName"]', 'Org B');
    await page.fill('input[name="orgSlug"]', `orgb-${timestampB}`);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    // Attempt to access Org A's tournament draft
    await page.goto(`http://localhost:3000/organizer/tournaments/new?id=${tournamentId}`);
    // We'll verify the draft name is NOT "Org A Tournament"
    const titleValue = await page.locator('input[placeholder="e.g. Summer Spikes 2026"]').inputValue().catch(() => '');
    expect(titleValue).not.toBe('Org A Tournament');
  });
});
