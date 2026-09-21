import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const adminClient = createClient(supabaseUrl, serviceRoleKey);

test.describe('Phase 4 Final Pass', () => {
  test('Issue 1 & 3: Homepage organizer detection and Profile dropdown stacking', async ({ page }) => {
    const runId = Date.now();
    const email = `org_${runId}@test.local`;
    const password = 'Password123!';

    // Create user and org
    const { data: { user } } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Final Tester' },
    });
    
    await adminClient.from('profiles').upsert({ id: user!.id, full_name: 'Final Tester', email });

    const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await anonClient.auth.signInWithPassword({ email, password });
    await anonClient.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Final Tester',
      p_org_name: `Test Org ${runId}`,
      p_org_slug: `final-org-${runId}`,
    });

    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:3000/');

    // Issue 1: "My Tournaments" must be visible OUTSIDE the dropdown for organizers
    // It should be visible on the main page header
    await expect(page.getByRole('link', { name: 'My Tournaments' }).first()).toBeVisible();

    // Issue 3: Profile dropdown stacking and clicking
    const profileBtn = page.getByRole('button', { name: 'Fi', exact: false });
    await profileBtn.click();
    
    // Ensure dropdown is open
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    // Move pointer towards dropdown and click My Profile to verify it doesn't close prematurely
    await page.getByRole('link', { name: 'My Profile' }).hover();
    await page.getByRole('link', { name: 'My Profile' }).click();

    // Should navigate to /profile
    await page.waitForURL(/.*\/profile.*/);
  });

  test('Issue 2 & 4: Public tournament routing and Back link', async ({ page }) => {
    const runId = Date.now();
    const email = `org2_${runId}@test.local`;
    const password = 'Password123!';

    // Create user and org
    const { data: { user } } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Final Tester 2' },
    });
    
    await adminClient.from('profiles').upsert({ id: user!.id, full_name: 'Final Tester 2', email });

    const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await anonClient.auth.signInWithPassword({ email, password });
    await anonClient.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Final Tester 2',
      p_org_name: `Test Org 2 ${runId}`,
      p_org_slug: `final-org2-${runId}`,
    });

    // Create a DRAFT tournament
    await anonClient.rpc('create_tournament_draft', {
      p_name: `Draft ${runId}`,
      p_slug: `draft-t-${runId}`,
      p_format: 'KNOCKOUT',
    });
    
    const slug = `draft-t-${runId}`;

    // Test Issue 2: Anonymous user CANNOT access DRAFT tournament
    await page.goto(`http://localhost:3000/t/${slug}`);
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).toBeVisible();

    // Login as organizer
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('http://localhost:3000/');

    // Test Issue 2: Organizer SHOULD be able to access their own DRAFT tournament
    await page.goto(`http://localhost:3000/t/${slug}`);
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: `Draft ${runId}` })).toBeVisible();

    // Test Issue 4: "Back to Tournaments" link should be visible and working
    const backLink = page.getByRole('link', { name: '← Back to Tournaments' });
    await expect(backLink).toBeVisible();
    await backLink.click();
    await page.waitForURL('http://localhost:3000/#tournaments');
  });
});
