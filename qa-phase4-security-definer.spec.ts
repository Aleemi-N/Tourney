import { test, expect } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Initialize Supabase admin client to setup data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';

test.describe('Security Definer View QA (public_revealed_lot_state)', () => {
  test('Anonymous users cannot query lot_entries directly', async ({ request }) => {
    // Attempt to query lot_entries directly using the anon key
    const response = await request.get(`${supabaseUrl}/rest/v1/lot_entries?select=*`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    // Due to RLS, an anonymous user should get exactly 0 rows from lot_entries
    expect(data).toEqual([]);
  });

  test('Anonymous users can query public_revealed_lot_state but hidden data is masked', async ({ request }) => {
    // Query the view
    const response = await request.get(`${supabaseUrl}/rest/v1/public_revealed_lot_state?select=*`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    
    // Verify that ANY row returned that is not SELECTED has null player_name and player_id
    for (const row of data) {
      if (row.status !== 'SELECTED') {
        expect(row.player_id).toBeNull();
        expect(row.player_name).toBeNull();
      }
    }
  });

  test('Anonymous users cannot inject WHERE clauses to leak hidden mapping', async ({ request }) => {
    // Attempt to filter the view by a hypothetical player_id (which isn't exported for hidden rows)
    const response = await request.get(`${supabaseUrl}/rest/v1/public_revealed_lot_state?player_id=not.is.null`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    
    // Any returned rows MUST be SELECTED.
    for (const row of data) {
      expect(row.status).toBe('SELECTED');
      expect(row.player_id).not.toBeNull();
    }
  });
});
