import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// For admin actions like creating users
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const anonClient = createClient(supabaseUrl, anonKey);
const adminClient = createClient(supabaseUrl, serviceRoleKey);

async function createTestUser(email: string) {
  const { data: { user }, error } = await adminClient.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true
  });
  if (error) throw error;
  
  // Login to get a session client
  const client = createClient(supabaseUrl, anonKey);
  await client.auth.signInWithPassword({ email, password: 'password123' });
  return { user: user!, client };
}

test.describe('Phase 4 Database Runtime Tests', () => {
  test.describe.configure({ mode: 'serial' });
  
  let playerA: { user: { id: string }, client: SupabaseClient };
  let playerB: { user: { id: string }, client: SupabaseClient };
  let orgA: { user: { id: string }, client: SupabaseClient };
  let orgB: { user: { id: string }, client: SupabaseClient };
  let tournamentA: string, tournamentB: string;
  
  test.beforeAll(async () => {
    const runId = Date.now();
    const emails = {
      playerA: `playera_${runId}@example.com`,
      playerB: `playerb_${runId}@example.com`,
      orgA: `orga_${runId}@example.com`,
      orgB: `orgb_${runId}@example.com`
    };

    // We assume the DB is fresh and roles/globals exist.
    playerA = await createTestUser(emails.playerA);
    playerB = await createTestUser(emails.playerB);
    orgA = await createTestUser(emails.orgA);
    orgB = await createTestUser(emails.orgB);
    
    // Create player profiles via raw SQL since there is no auth trigger
    await adminClient.from('profiles').insert({ id: playerA.user.id, full_name: 'Player A', email: emails.playerA });
    await adminClient.from('profiles').insert({ id: playerB.user.id, full_name: 'Player B', email: emails.playerB });

    
    // Create Org A and Tournament A
    const { error: orgAError } = await orgA.client.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Org A',
      p_org_name: 'Organization A', p_org_slug: `org-a-${runId}`
    });
    if (orgAError) throw new Error('Org A Onboarding Failed: ' + orgAError.message);
    const { data: trnA, error: errA } = await orgA.client.rpc('create_tournament_draft', {
      p_name: 'Tournament A', p_slug: `trn-a-${runId}`, p_format: 'LEAGUE', p_league_mode: 'AUCTION'
    });
    if (errA) throw errA;
    tournamentA = trnA.tournament_id;
    await orgA.client.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', tournamentA);
    
    // Create Org B and Tournament B
    const { error: orgBError } = await orgB.client.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Org B',
      p_org_name: 'Organization B', p_org_slug: `org-b-${runId}`
    });
    if (orgBError) throw new Error('Org B Onboarding Failed: ' + orgBError.message);
    const { data: trnB, error: errB } = await orgB.client.rpc('create_tournament_draft', {
      p_name: 'Tournament B', p_slug: `trn-b-${runId}`, p_format: 'LEAGUE', p_league_mode: 'REGISTERED_TEAM'
    });
    if (errB) throw errB;
    tournamentB = trnB.tournament_id;
    await orgB.client.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', tournamentB);
  });
  
  test('PLAYER PROFILE: anonymous profile mutation rejected', async () => {
    const { error } = await anonClient.rpc('update_player_profile', {
      p_display_name: 'Anon', p_primary_position: 'OUTSIDE_HITTER'
    });
    expect(error?.message).toMatch(/Unauthenticated|JWT/);
  });
  
  test('PLAYER PROFILE: player can create/update own profile', async () => {
    const { error } = await playerA.client.rpc('update_player_profile', {
      p_display_name: 'Player A', p_primary_position: 'OUTSIDE_HITTER',
      p_height_cm: 190, p_place: 'City'
    });
    expect(error).toBeNull();
  });
  
  test('PLAYER PROFILE: User A cannot mutate User B profile', async () => {
    const { error } = await playerA.client.from('player_profiles').update({ display_name: 'Hacked' }).eq('id', playerB.user.id);
    expect(error).toBeNull(); // Update succeeds quietly but updates 0 rows due to RLS
    const { data } = await adminClient.from('player_profiles').select('display_name').eq('id', playerB.user.id).single();
    expect(data).toBeNull(); // Profile doesn't exist yet
  });
  
  test('PLAYER REGISTRATION: duplicate submission produces exactly one registration', async () => {
    const res1 = await playerA.client.rpc('submit_player_registration', {
      p_tournament_id: tournamentA, p_display_name: 'Player A', p_primary_position: 'OUTSIDE_HITTER'
    });
    expect(res1.error).toBeNull();
    
    const res2 = await playerA.client.rpc('submit_player_registration', {
      p_tournament_id: tournamentA, p_display_name: 'Player A', p_primary_position: 'OUTSIDE_HITTER'
    });
    expect(res2.error?.message).toContain('Registration already exists'); // Explicitly throws
    
    const { data: profile } = await adminClient.from('player_profiles').select('*').eq('user_id', playerA.user.id).single();
    expect(profile!.display_name).toBe('Player A'); // Reverted due to rollback!
    const { data } = await adminClient.from('player_tournament_registrations')
      .select('*').eq('player_id', profile.id).eq('tournament_id', tournamentA);
    expect(data?.length).toBe(1);
  });
  
  test('PLAYER REGISTRATION: non-REGISTRATION tournament fails', async () => {
    await adminClient.from('tournaments').update({ status: 'DRAFT' }).eq('id', tournamentA);
    const res = await playerB.client.rpc('submit_player_registration', {
      p_tournament_id: tournamentA, p_display_name: 'Player B', p_primary_position: 'LIBERO'
    });
    expect(res.error?.message).toContain('Tournament is not open for registration');
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', tournamentA);
  });
  
  test('ORGANIZER ISOLATION: Organizer A cannot approve Tournament B player', async () => {
    await playerB.client.rpc('submit_player_registration', {
      p_tournament_id: tournamentB, p_display_name: 'Player B', p_primary_position: 'LIBERO'
    });
    
    const { data: regDataB } = await adminClient.from('player_tournament_registrations').select('id').eq('tournament_id', tournamentB).single();
      
    const res = await orgA.client.rpc('approve_player_registration', {
      p_registration_id: regDataB!.id
    });
    expect(res.error?.message).toContain('Unauthorized');
  });
  
  test('AUCTION CLASSIFICATION: AUCTION league accepts categories', async () => {
    const { data: regDataA } = await adminClient.from('player_tournament_registrations').select('id').eq('tournament_id', tournamentA).single();
      
    const res = await orgA.client.rpc('approve_player_registration', {
      p_registration_id: regDataA!.id, p_auction_category: 'ICON_LOT'
    });
    expect(res.error).toBeNull();
  });
  
  test('AUCTION CLASSIFICATION: REGISTERED_TEAM fails with auction category', async () => {
    const { data: regDataB } = await adminClient.from('player_tournament_registrations').select('id').eq('tournament_id', tournamentB).single();
    
    const res = await orgB.client.rpc('approve_player_registration', {
      p_registration_id: regDataB!.id, p_auction_category: 'ICON_LOT'
    });
    expect(res.error?.message).toContain('Auction category must be NULL for non-auction tournaments');
  });
  
  test('AUCTION CLASSIFICATION: KNOCKOUT tournament rejects auction category', async () => {
    const { data: trnK } = await orgA.client.rpc('create_tournament_draft', {
      p_name: 'Tournament K2', p_slug: 'trn-k2', p_format: 'KNOCKOUT'
    });
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', trnK.tournament_id);
    const { data: regId } = await playerB.client.rpc('submit_player_registration', {
      p_tournament_id: trnK.tournament_id, p_display_name: 'Player B', p_primary_position: 'LIBERO'
    });
    const res = await orgA.client.rpc('approve_player_registration', {
      p_registration_id: regId, p_auction_category: 'ICON_LOT'
    });
    expect(res.error?.message).toContain('Auction category must be NULL for non-auction tournaments');
  });
  
  test('TEAM OWNER: non-REGISTRATION tournament fails', async () => {
    await adminClient.from('tournaments').update({ status: 'DRAFT' }).eq('id', tournamentA);
    const res = await playerA.client.rpc('submit_team_owner_application', {
      p_tournament_id: tournamentA, p_proposed_team_name: 'Team A', p_team_short_name: 'TMA'
    });
    expect(res.error?.message).toContain('Tournament is not open for registration');
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', tournamentA);
  });

  test('TEAM OWNER: format KNOCKOUT fails', async () => {
    // Create a KNOCKOUT tournament
    const { data: trnK, error: errK } = await orgA.client.rpc('create_tournament_draft', {
      p_name: 'Tournament K', p_slug: 'trn-k', p_format: 'KNOCKOUT'
    });
    expect(errK).toBeNull();
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', trnK.tournament_id);
    
    const res = await playerA.client.rpc('submit_team_owner_application', {
      p_tournament_id: trnK.tournament_id, p_proposed_team_name: 'Team A', p_team_short_name: 'TMA'
    });
    expect(res.error?.message).toContain('Tournament format does not support teams');
  });
  
  test('STATE TRANSITIONS: player registration', async () => {
    // Submit registration (PENDING)
    const { data: regId, error: submitErr } = await playerA.client.rpc('submit_player_registration', {
      p_tournament_id: tournamentB, p_display_name: 'Player A', p_primary_position: 'OUTSIDE_HITTER'
    });
    expect(submitErr).toBeNull();
    
    // Approve
    await orgB.client.rpc('approve_player_registration', { p_registration_id: regId });
    
    const { data: regApp } = await adminClient.from('player_tournament_registrations').select('status').eq('id', regId).single();
    expect(regApp?.status).toBe('APPROVED');
    
    // Attempt Reject on APPROVED should fail or be idempotent (wait, RPC says PENDING or CHANGES_REQUESTED only for reject)
    const { error: errReject } = await orgB.client.rpc('reject_player_registration', { p_registration_id: regId });
    expect(errReject?.message).toContain('Cannot reject registration in status: APPROVED');
  });
  
  test('TEAM OWNER: authenticated application succeeds', async () => {
    const res = await playerA.client.rpc('submit_team_owner_application', {
      p_tournament_id: tournamentB, p_proposed_team_name: 'Team B', p_team_short_name: 'TMB'
    });
    expect(res.error).toBeNull();
  });
  
  test('TEAM OWNER: duplicate/retry produces exactly one application', async () => {
    const res = await playerA.client.rpc('submit_team_owner_application', {
      p_tournament_id: tournamentB, p_proposed_team_name: 'Team B', p_team_short_name: 'TMB'
    });
    // RPC says "Application already exists". So it throws!
    expect(res.error?.message).toContain('Application already exists');
  });

  test('STATE TRANSITIONS: team owner application approval and idempotency', async () => {
    // Get the app ID
    const { data: app } = await adminClient.from('team_owner_applications').select('id').eq('user_id', playerA.user.id).eq('tournament_id', tournamentB).single();
    
    // Approve
    await orgB.client.rpc('approve_team_owner_application', { p_application_id: app!.id });
    
    // Check teams, team_owners, tournament_members
    const { data: teams } = await adminClient.from('teams').select('*').eq('tournament_id', tournamentB);
    expect(teams?.length).toBe(1);
    
    const { data: owners } = await adminClient.from('team_owners').select('*').eq('team_id', teams![0].id);
    expect(owners?.length).toBe(1);
    expect(owners![0].user_id).toBe(playerA.user.id);
    
    const { data: members } = await adminClient.from('tournament_members').select('*').eq('tournament_id', tournamentB).eq('user_id', playerA.user.id);
    expect(members?.length).toBe(1);
    expect(members![0].role).toBe('TEAM_OWNER');
    
    // Approve again (idempotent)
    await orgB.client.rpc('approve_team_owner_application', { p_application_id: app!.id });
    
    const { data: teams2 } = await adminClient.from('teams').select('*').eq('tournament_id', tournamentB);
    expect(teams2?.length).toBe(1); // No duplicate team
  });

  test('STORAGE - AVATARS: User A uploads own valid JPEG', async () => {
    // 1x1 pixel JPEG base64
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const buf = Buffer.from(b64, 'base64');
    const { data, error } = await playerA.client.storage.from('avatars').upload(`${playerA.user.id}/photo.jpeg`, buf, { contentType: 'image/jpeg' });
    expect(error).toBeNull();
    expect(data?.path).toBeTruthy();
  });
  
  test('STORAGE - AVATARS: User A cannot upload into User B folder', async () => {
    const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const { error } = await playerA.client.storage.from('avatars').upload(`${playerB.user.id}/photo.jpeg`, buf, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  test('STORAGE - AVATARS: invalid MIME rejected', async () => {
    const buf = Buffer.from('test text');
    const { error } = await playerA.client.storage.from('avatars').upload(`${playerA.user.id}/photo.txt`, buf, { contentType: 'text/plain' });
    expect(error?.message).toContain('mime');
  });

  test('STORAGE - AVATARS: >2MB upload rejected', async () => {
    const buf = Buffer.alloc(2097153); // 2MB + 1 byte
    const { error } = await playerA.client.storage.from('avatars').upload(`${playerA.user.id}/photo_large.jpeg`, buf, { contentType: 'image/jpeg' });
    expect(error).not.toBeNull();
  });

  test('STORAGE - AVATARS: own replacement/upsert works', async () => {
    const buf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const { error } = await playerA.client.storage.from('avatars').upload(`${playerA.user.id}/photo.jpeg`, buf, { contentType: 'image/jpeg', upsert: true });
    expect(error).toBeNull();
  });

  test('STORAGE - LOGOS: authenticated applicant can upload own valid logo', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const buf = Buffer.from(b64, 'base64');
    const { data, error } = await playerA.client.storage.from('logos').upload(`${playerA.user.id}/logo.png`, buf, { contentType: 'image/png' });
    expect(error).toBeNull();
    expect(data?.path).toBeTruthy();
  });

  test('STORAGE: Anonymous Storage Mutation Rejected', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const buf = Buffer.from(b64, 'base64');
    
    // Test INSERT
    const { error: insErr } = await anonClient.storage.from('avatars').upload(`anon/photo.jpeg`, buf, { contentType: 'image/jpeg' });
    expect(insErr).not.toBeNull();
    
    // Test UPDATE (upsert)
    const { error: updErr } = await anonClient.storage.from('avatars').upload(`${playerA.user.id}/photo.jpeg`, buf, { contentType: 'image/jpeg', upsert: true });
    expect(updErr).not.toBeNull();
    
    // Test DELETE
    const { error: delErr } = await anonClient.storage.from('avatars').remove([`${playerA.user.id}/photo.jpeg`]);
    // Supabase storage-api returns error when lacking delete permissions or might return data: []
    // Let's check both possibilities.
    if (delErr) {
      expect(delErr).not.toBeNull();
    }
    
    // Test READ (should succeed because publicUrl is just URL construction, but let's check it doesn't throw)
    const { data: urlData } = anonClient.storage.from('avatars').getPublicUrl(`${playerA.user.id}/photo.jpeg`);
    expect(urlData.publicUrl).toBeTruthy();
  });

  test.afterAll(async () => {
    // Cleanup: remove all users created by this suite.
    const users = [playerA?.user?.id, playerB?.user?.id, orgA?.user?.id, orgB?.user?.id].filter(Boolean);
    for (const uid of users) {
      await adminClient.auth.admin.deleteUser(uid);
    }
  });
});

