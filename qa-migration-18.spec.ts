import { test, expect } from '@playwright/test';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

async function createTestUser(email: string) {
  const { data: { user }, error } = await adminClient.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true
  });
  if (error) throw error;

  const client = createClient(supabaseUrl, anonKey);
  await client.auth.signInWithPassword({ email, password: 'password123' });
  return { user: user!, client };
}

const RUN_ID = Date.now();

test.describe('Migration 18 RLS Policies — team_owner_applications', () => {
  test.describe.configure({ mode: 'serial' });

  let orgA: { user: { id: string }, client: SupabaseClient };
  let orgB: { user: { id: string }, client: SupabaseClient };
  let playerA: { user: { id: string }, client: SupabaseClient };
  let playerB: { user: { id: string }, client: SupabaseClient };

  let orgATournamentId: string;
  let orgBTournamentId: string;
  let playerAAppId: string;

  test.beforeAll(async () => {
    orgA = await createTestUser(`orga-${RUN_ID}@test.com`);
    orgB = await createTestUser(`orgb-${RUN_ID}@test.com`);
    playerA = await createTestUser(`playera-${RUN_ID}@test.com`);
    playerB = await createTestUser(`playerb-${RUN_ID}@test.com`);

    // Org A + Tournament A
    const { error: onboardA } = await orgA.client.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Org A User', p_org_name: `OrgA-${RUN_ID}`, p_org_slug: `org-a-${RUN_ID}`
    });
    if (onboardA) throw new Error('Org A onboarding failed: ' + onboardA.message);

    const { data: trnA, error: errA } = await orgA.client.rpc('create_tournament_draft', {
      p_name: `Trn A ${RUN_ID}`, p_slug: `trn-a-${RUN_ID}`, p_format: 'LEAGUE', p_league_mode: 'AUCTION'
    });
    if (errA) throw new Error('Trn A creation failed: ' + errA.message);
    orgATournamentId = trnA.tournament_id;
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', orgATournamentId);

    // Org B + Tournament B
    const { error: onboardB } = await orgB.client.rpc('initialize_organizer_onboarding', {
      p_full_name: 'Org B User', p_org_name: `OrgB-${RUN_ID}`, p_org_slug: `org-b-${RUN_ID}`
    });
    if (onboardB) throw new Error('Org B onboarding failed: ' + onboardB.message);

    const { data: trnB, error: errB } = await orgB.client.rpc('create_tournament_draft', {
      p_name: `Trn B ${RUN_ID}`, p_slug: `trn-b-${RUN_ID}`, p_format: 'LEAGUE', p_league_mode: 'AUCTION'
    });
    if (errB) throw new Error('Trn B creation failed: ' + errB.message);
    orgBTournamentId = trnB.tournament_id;
    await adminClient.from('tournaments').update({ status: 'REGISTRATION' }).eq('id', orgBTournamentId);

    // Ensure profile rows exist for playerA and playerB (FK requirement)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminClient.from('profiles').upsert({ id: playerA.user.id, full_name: 'Player A', email: (playerA.user as any).email });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await adminClient.from('profiles').upsert({ id: playerB.user.id, full_name: 'Player B', email: (playerB.user as any).email });
  });

  // --------------------------------------------------------------------------
  // Submit application first
  // --------------------------------------------------------------------------

  test('submit_team_owner_application → application created', async () => {
    const { data: appId, error } = await playerA.client.rpc('submit_team_owner_application', {
      p_tournament_id: orgATournamentId,
      p_proposed_team_name: 'Team A',
      p_team_short_name: 'TMA'
    });
    expect(error).toBeNull();
    expect(appId).toBeTruthy();
    playerAAppId = appId;
  });

  // --------------------------------------------------------------------------
  // SELECT policies
  // --------------------------------------------------------------------------

  test('A. applicant can SELECT own application', async () => {
    const { data, error } = await playerA.client
      .from('team_owner_applications')
      .select('id, status')
      .eq('id', playerAAppId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data![0].id).toBe(playerAAppId);
    expect(data![0].status).toBe('PENDING');
  });

  test('B. User A cannot SELECT User B application', async () => {
    const { data, error } = await playerB.client
      .from('team_owner_applications')
      .select('id')
      .eq('id', playerAAppId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0); // RLS returns no rows
  });

  test('C. anonymous cannot SELECT application', async () => {
    const { data, error } = await anonClient
      .from('team_owner_applications')
      .select('id')
      .eq('id', playerAAppId);
    // Unauthenticated: 0 rows (no USING clause matches uid() = null)
    if (error) {
      expect(error).toBeTruthy();
    } else {
      expect(data?.length).toBe(0);
    }
  });

  test('D. correct organizer can SELECT tournament applications', async () => {
    const { data, error } = await orgA.client
      .from('team_owner_applications')
      .select('id, status')
      .eq('id', playerAAppId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data![0].status).toBe('PENDING');
  });

  test('E. Organizer B cannot SELECT Tournament A application', async () => {
    const { data, error } = await orgB.client
      .from('team_owner_applications')
      .select('id')
      .eq('id', playerAAppId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  test('F. cross-organization SELECT blocked', async () => {
    // Org B queries all applications for Tournament A — should see none
    const { data, error } = await orgB.client
      .from('team_owner_applications')
      .select('id')
      .eq('tournament_id', orgATournamentId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Mutation blocks
  // --------------------------------------------------------------------------

  test('G. applicant direct status UPDATE remains blocked', async () => {
    const { data, error } = await playerA.client
      .from('team_owner_applications')
      .update({ status: 'APPROVED' })
      .eq('id', playerAAppId)
      .select();

    // RLS: no UPDATE policy exists, so 0 rows affected (or error)
    if (!error) {
      expect(data?.length).toBe(0);
    } else {
      expect(error).toBeTruthy();
    }

    // Authoritative check: status must still be PENDING
    const { data: verify } = await adminClient
      .from('team_owner_applications')
      .select('status')
      .eq('id', playerAAppId)
      .single();
    expect(verify?.status).toBe('PENDING');
  });

  test('H. applicant direct DELETE remains blocked', async () => {
    const { data, error } = await playerA.client
      .from('team_owner_applications')
      .delete()
      .eq('id', playerAAppId)
      .select();

    if (!error) {
      expect(data?.length).toBe(0);
    } else {
      expect(error).toBeTruthy();
    }

    // Authoritative check: row must still exist
    const { data: verify } = await adminClient
      .from('team_owner_applications')
      .select('id')
      .eq('id', playerAAppId)
      .single();
    expect(verify?.id).toBe(playerAAppId);
  });

  // --------------------------------------------------------------------------
  // Page-reload cycle
  // --------------------------------------------------------------------------

  test('submit → applicant SELECT succeeds → status PENDING readable', async () => {
    const { data, error } = await playerA.client
      .from('team_owner_applications')
      .select('id, status')
      .eq('tournament_id', orgATournamentId)
      .eq('user_id', playerA.user.id)
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe('PENDING');
  });
});
