import { test, expect } from '@playwright/test';

test.describe('Phase 4 UI Tests', () => {
  
  test('unauthenticated player profile redirects to login', async ({ page }) => {
    await page.goto('http://localhost:3000/player/profile');
    await expect(page).toHaveURL(/.*\/login\?next=.*player.*profile/);
  });

  test('player registration redirects to login', async ({ page }) => {
    await page.goto('http://localhost:3000/t/test-tournament/register/player');
    await expect(page).toHaveURL(/.*\/login\?next=.*register%2Fplayer/);
  });

  test('owner application redirects to login', async ({ page }) => {
    await page.goto('http://localhost:3000/t/test-tournament/register/team');
    await expect(page).toHaveURL(/.*\/login\?next=.*register%2Fteam/);
  });

  test('unauthenticated owner dashboard redirects to login', async ({ page }) => {
    await page.goto('http://localhost:3000/owner/dashboard');
    await expect(page).toHaveURL(/.*\/login/);
  });

  test('unauthenticated organizer participants redirects to login', async ({ page }) => {
    await page.goto('http://localhost:3000/organizer/tournaments/00000000-0000-0000-0000-000000000000/participants');
    await expect(page).toHaveURL(/.*\/login/);
  });

});
