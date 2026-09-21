import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const adminClient = createClient(supabaseUrl, serviceRoleKey);

test.describe('Phase 4 Browser E2E', () => {
  test.describe.configure({ mode: 'serial' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let orgUser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playerUser: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ownerUser: any;
  
  let auctionTournyId: string;
  let auctionTournySlug: string;
  
  let knockoutTournyId: string;
  let knockoutTournySlug: string;

  const validAvatar = path.resolve(process.cwd(), 'test-assets', 'valid-avatar.jpg');
  const validLogo = path.resolve(process.cwd(), 'test-assets', 'valid-logo.png');
  const invalidMime = path.resolve(process.cwd(), 'test-assets', 'invalid-mime.txt');
  const largeAvatar = path.resolve(process.cwd(), 'test-assets', 'large-avatar.jpg');

  test.beforeAll(async () => {
    // Seed identities
    const createTestIdentity = async (email: string) => {
      const { data: { user } } = await adminClient.auth.admin.createUser({
        email, password: 'password123', email_confirm: true
      });
      await adminClient.from('profiles').insert({ id: user!.id, full_name: email.split('@')[0], email });
      return user!;
    };

    const runId = Date.now();
    orgUser = await createTestIdentity(`uiorg_${runId}@test.com`);
    playerUser = await createTestIdentity(`uiplayer_${runId}@test.com`);
    ownerUser = await createTestIdentity(`uiowner_${runId}@test.com`);

    const orgClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await orgClient.auth.signInWithPassword({ email: orgUser.email, password: 'password123' });

    await orgClient.rpc('initialize_organizer_onboarding', {
      p_full_name: 'UI Org', p_org_name: 'UI Organization', p_org_slug: `ui-org-${runId}`
    });

    auctionTournySlug = `auction-${runId}`;
    const { data: tA } = await orgClient.rpc('create_tournament_draft', {
      p_name: 'UI Auction', p_slug: auctionTournySlug, p_format: 'LEAGUE', p_league_mode: 'AUCTION'
    });
    auctionTournyId = tA.tournament_id;
    await orgClient.from('tournaments').update({ status: 'REGISTRATION', is_public: true }).eq('id', auctionTournyId);

    knockoutTournySlug = `knockout-${runId}`;
    const { data: tB, error: errB } = await orgClient.rpc('create_tournament_draft', {
      p_name: 'UI Knockout', p_slug: knockoutTournySlug, p_format: 'KNOCKOUT'
    });
    if (errB) throw errB;
    knockoutTournyId = tB.tournament_id;
    await orgClient.from('tournaments').update({ status: 'REGISTRATION', is_public: true }).eq('id', knockoutTournyId);
  });

  test('1. PLAYER E2E', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:3000/t/${auctionTournySlug}/register/player`);
    await expect(page).toHaveURL(/.*\/login\?next=.*register%2Fplayer/);

    await page.fill('input[name="email"]', playerUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(`http://localhost:3000/t/${auctionTournySlug}/register/player`);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidMime);
    await expect(page.locator('text=Invalid file type')).toBeVisible();

    await fileInput.setInputFiles(largeAvatar);
    await expect(page.locator('text=less than 2MB')).toBeVisible();

    await fileInput.setInputFiles(validAvatar);
    
    await page.fill('input[name="displayName"]', 'UI Player A');
    await page.selectOption('select[name="primaryPosition"]', 'OUTSIDE_HITTER');
    await page.fill('input[name="dob"]', '1995-01-01');
    await page.fill('input[name="phone"]', '+1234567890');
    await page.fill('input[name="place"]', 'Test City');
    await page.fill('input[name="height"]', '190');

    await page.click('button[type="submit"]');

    // After successful registration, user is navigated back to the actual tournament page
    await expect(page).toHaveURL(`http://localhost:3000/t/${auctionTournySlug}`, { timeout: 15000 });
    // The public tournament page must show the tournament name (not "coming soon")
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });

    // Re-visiting the registration form should still show status (duplicate guard)
    await page.goto(`http://localhost:3000/t/${auctionTournySlug}/register/player`);
    await expect(page.locator('text=Registration Status')).toBeVisible();

    await page.goto('http://localhost:3000/player/profile');
    const profileBody = await page.locator('body').innerText();
    console.log('--- PROFILE BODY ---');
    console.log(profileBody);
    console.log('--------------------');
    await expect(page.locator('input[name="displayName"]')).toHaveValue('UI Player A');
    await page.fill('input[name="place"]', 'Updated City');
    
    // Replace avatar
    const fileInputProfile = page.locator('input[type="file"]');
    await fileInputProfile.setInputFiles(validAvatar);

    await page.click('button[type="submit"]');
    
    // Using a more robust wait
    await page.waitForTimeout(500); 

    await page.reload();
    await expect(page.locator('input[name="place"]')).toHaveValue('Updated City');
  });

  test('2. TEAM OWNER E2E', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:3000/t/${auctionTournySlug}/register/team`);
    await expect(page).toHaveURL(/.*\/login\?next=.*register%2Fteam/);

    await page.fill('input[name="email"]', ownerUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(`http://localhost:3000/t/${auctionTournySlug}/register/team`);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(validLogo);
    
    await page.fill('input[name="proposedTeamName"]', 'UI Team Owner');
    await page.fill('input[name="teamShortName"]', 'UTO');
    await page.fill('input[name="place"]', 'Test City');

    await page.click('button[type="submit"]');

    // After successful application, user is navigated to the actual tournament page
    await expect(page).toHaveURL(`http://localhost:3000/t/${auctionTournySlug}`, { timeout: 15000 });
    // The public tournament page must show the tournament name (not "coming soon")
    await expect(page.locator('h1')).toBeVisible({ timeout: 5000 });

    // Prevent duplicate — re-visiting shows status
    await page.goto(`http://localhost:3000/t/${auctionTournySlug}/register/team`);
    await expect(page.locator('text=Application Status')).toBeVisible();
  });

  test('3. ORGANIZER — PLAYER E2E', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:3000/login?next=%2Forganizer%2Fdashboard`);
    await page.fill('input[name="email"]', orgUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });


    await page.goto(`http://localhost:3000/organizer/tournaments/${auctionTournyId}/participants`);

    await expect(page.locator('h3:has-text("UI Player A")')).toBeVisible();
    
    const select = page.locator('select[name="classification"]');
    await expect(select).toBeVisible();
    await select.selectOption('ICON_LOT');

    await page.click('button:has-text("Approve")');

    // Switch filter to ALL so the approved record is visible
    await page.locator('#statusFilter').selectOption('ALL');
    await expect(page.locator('span:has-text("APPROVED")')).toBeVisible({ timeout: 8000 });

    await page.reload();
    await page.locator('#statusFilter').selectOption('ALL');
    await expect(page.locator('span:has-text("APPROVED")')).toBeVisible();
  });

  test('4. ORGANIZER — TEAM OWNER E2E', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:3000/login?next=%2Forganizer%2Fdashboard`);
    await page.fill('input[name="email"]', orgUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    // Wait for login to complete
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    
    await page.goto(`http://localhost:3000/organizer/tournaments/${auctionTournyId}/participants`);

    // Team Owners tab button text includes count: 'Team Owners (N)'
    await page.click('button:has-text("Team Owners")');

    await expect(page.locator('h3:has-text("UI Team Owner")')).toBeVisible();
    
    await page.click('button:has-text("Approve")');

    // Switch filter to ALL so the approved record is visible
    await page.locator('#statusFilter').selectOption('ALL');
    await expect(page.locator('span:has-text("APPROVED")')).toBeVisible({ timeout: 8000 });

    await page.reload();
    await page.click('button:has-text("Team Owners")');
    await page.locator('#statusFilter').selectOption('ALL');
    await expect(page.locator('span:has-text("APPROVED")')).toBeVisible();
    
    // Check DB state: team owner record and tournament membership must exist
    const { data: teamOwner } = await adminClient.from('team_owners').select('*').eq('user_id', ownerUser.id).single();
    expect(teamOwner).toBeTruthy();
    const { data: member } = await adminClient.from('tournament_members').select('*').eq('user_id', ownerUser.id).eq('tournament_id', auctionTournyId).eq('role', 'TEAM_OWNER').single();
    expect(member).toBeTruthy();
  });

  test('5. APPROVED OWNER DASHBOARD E2E', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`http://localhost:3000/login`);
    await page.fill('input[name="email"]', ownerUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    // Wait for any non-login URL (login success)
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10000 });

    await page.goto('http://localhost:3000/owner/dashboard');
    await expect(page).toHaveURL(/.*\/owner\/dashboard/, { timeout: 10000 });
    // Dashboard should show the approved team name and tournament name
    await expect(page.locator('text=UI Team Owner')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=UI Auction')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. PUBLIC TOURNAMENT PAGE — regression test
  //    Verifies the /t/[slug] page shows real data (not the old placeholder).
  // ──────────────────────────────────────────────────────────────────────────
  test('6. PUBLIC TOURNAMENT PAGE — anonymous access shows real content', async ({ page }) => {
    // Must be accessible without auth
    await page.goto(`http://localhost:3000/t/${auctionTournySlug}`);

    // Must NOT redirect to login
    expect(page.url()).not.toContain('/login');
    expect(page.url()).toContain(`/t/${auctionTournySlug}`);

    // Must show actual tournament name in an h1 (not "coming soon" placeholder)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 8000 });
    await expect(heading).toContainText('UI Auction');

    // Must NOT show the old placeholder text
    await expect(page.locator('text=coming soon')).not.toBeVisible();
    await expect(page.locator('text=Public tournament page')).not.toBeVisible();

    // Registration CTAs must be visible (tournament is in REGISTRATION status)
    await expect(page.locator('#player-register-cta')).toBeVisible();
    await expect(page.locator('#team-owner-register-cta')).toBeVisible();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. PUBLIC TOURNAMENT PAGE — private/draft tournament returns not-found
  // ──────────────────────────────────────────────────────────────────────────
  test('7. PUBLIC TOURNAMENT PAGE — non-existent slug shows not-found', async ({ page }) => {
    await page.goto('http://localhost:3000/t/this-slug-does-not-exist-xyz123');
    // Must stay on the page (not redirect)
    expect(page.url()).toContain('/t/this-slug-does-not-exist-xyz123');
    // Must show not-found message
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).toBeVisible({ timeout: 8000 });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. PHOTO RENDERING — organizer participants shows uploaded avatar
  //    Depends on test 1 (player with photo registered) and test 3 (approved).
  // ──────────────────────────────────────────────────────────────────────────
  test('8. PLAYER PHOTO — uploaded photo renders in organizer participants', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://localhost:3000/login?next=%2Forganizer%2Fdashboard');
    await page.fill('input[name="email"]', orgUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    await page.goto(`http://localhost:3000/organizer/tournaments/${auctionTournyId}/participants`);

    // Switch to ALL filter to include approved players
    await page.locator('#statusFilter').selectOption('ALL');

    // The player card must be present
    await expect(page.locator('h3:has-text("UI Player A")')).toBeVisible({ timeout: 8000 });

    // Check that an img element exists in the card (rendered photo, not initials fallback)
    const imgElement = page.locator('h3:has-text("UI Player A")').locator('xpath=ancestor::*[contains(@class,"overflow-hidden")]//img');
    await expect(imgElement).toBeVisible({ timeout: 5000 });

    // The img src must not be empty or a broken data URI
    const src = await imgElement.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).not.toContain('undefined');
    expect(src).toContain('avatars'); // Must be from Supabase avatars bucket
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. NO-PHOTO FALLBACK — player without photo shows initials, no broken img
  // ──────────────────────────────────────────────────────────────────────────
  test('9. PLAYER NO-PHOTO — initials shown, no broken image', async ({ browser }) => {
    // Create a player user with no photo
    const noPhotoUser = await adminClient.auth.admin.createUser({
      email: `nophoto_${Date.now()}@test.com`,
      password: 'password123',
      email_confirm: true,
    });
    const noPhotoUserId = noPhotoUser.data.user!.id;
    await adminClient.from('profiles').insert({
      id: noPhotoUserId,
      full_name: 'No Photo Player',
      email: noPhotoUser.data.user!.email,
    });

    // Register without photo via RPC (server-side with anon client)
    const noPhotoClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await noPhotoClient.auth.signInWithPassword({ email: noPhotoUser.data.user!.email!, password: 'password123' });
    await noPhotoClient.rpc('submit_player_registration', {
      p_tournament_id: auctionTournyId,
      p_display_name: 'No Photo Player',
      p_primary_position: 'LIBERO',
    });

    // Visit organizer participants page
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('http://localhost:3000/login?next=%2Forganizer%2Fdashboard');
    await page.fill('input[name="email"]', orgUser.email);
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    await page.goto(`http://localhost:3000/organizer/tournaments/${auctionTournyId}/participants`);
    await expect(page.locator('h3:has-text("No Photo Player")')).toBeVisible({ timeout: 8000 });

    // The card for No Photo Player must NOT have a broken img, must show initials instead
    // Look for the fallback initials div (contains "NP")
    const initialsEl = page.locator('h3:has-text("No Photo Player")').locator('xpath=ancestor::*[contains(@class,"overflow-hidden")]//*[contains(@class,"text-4xl")]');
    await expect(initialsEl).toBeVisible({ timeout: 5000 });

    // Cleanup no-photo user
    await adminClient.auth.admin.deleteUser(noPhotoUserId);
  });
  // ──────────────────────────────────────────────────────────────────────────
  // 10. MULTI-TAB CONTEXT ISOLATION
  // ──────────────────────────────────────────────────────────────────────────
  test('10. MULTI-TAB CONTEXT — context is derived from URL, no global bleeding', async ({ browser }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    
    // Login as org
    await pageA.goto('http://localhost:3000/login?next=%2Forganizer%2Fdashboard');
    await pageA.fill('input[name="email"]', orgUser.email);
    await pageA.fill('input[name="password"]', 'password123');
    await pageA.click('button[type="submit"]');
    await expect(pageA).toHaveURL(/.*\/organizer\/dashboard/, { timeout: 10000 });

    // Page A goes to Auction Tournament Participants
    await pageA.goto(`http://localhost:3000/organizer/tournaments/${auctionTournyId}/participants`);
    await expect(pageA.locator('h1')).toContainText('Participant Management');

    // Page B goes to Knockout Tournament Settings (or participants since settings doesn't exist yet)
    const pageB = await context.newPage();
    await pageB.goto(`http://localhost:3000/organizer/tournaments/${knockoutTournyId}/participants`);
    await expect(pageB.locator('h1')).toContainText('Participant Management');

    // Page C goes to Create new tournament
    const pageC = await context.newPage();
    await pageC.goto('http://localhost:3000/organizer/tournaments/new');
    await expect(pageC.locator('h1')).toContainText('Create New Tournament');

    // Ensure A and B still have their correct context in URL
    expect(pageA.url()).toContain(auctionTournyId);
    expect(pageB.url()).toContain(knockoutTournyId);
  });


  test.afterAll(async () => {
    // ── Cleanup: remove all records created by this test suite run ──────────
    // Only deletes tournaments created by this run (identified by stored IDs).
    // Does NOT touch any user-created data.

    const idsToDelete = [auctionTournyId, knockoutTournyId].filter(Boolean);
    if (idsToDelete.length > 0) {
      // Delete tournaments. Cascades remove registrations, teams, etc.
      await adminClient.from('tournaments').delete().in('id', idsToDelete);
    }

    // Remove test users via admin API
    const usersToDelete = [orgUser?.id, playerUser?.id, ownerUser?.id].filter(Boolean);
    for (const uid of usersToDelete) {
      await adminClient.auth.admin.deleteUser(uid);
    }
  });
});


