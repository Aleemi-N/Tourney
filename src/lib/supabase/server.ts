import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Database } from './types';

/**
 * Server-side Supabase client.
 *
 * Use this in Server Components and Route Handlers.
 * Do NOT share this client across requests — always call createClient() fresh.
 * Do NOT use this in Client Components or Middleware.
 *
 * Uses the current @supabase/ssr API: getAll/setAll (not deprecated get/set/remove).
 *
 * setAll is provided so token refreshes can be written back to cookies from
 * Server Components and Route Handlers where possible. Middleware MUST also
 * be configured to handle session refresh for routes where cookies cannot be
 * set from the component/handler.
 *
 * Architecture rule: server controls authoritative state — never trust
 * client-supplied values for competitive tournament state.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll may throw in Server Components where the response has
            // already been committed. The Middleware must handle session
            // refresh in those cases to prevent authentication issues.
          }
        },
      },
    },
  );
}

/**
 * Cached getUser for Server Components and Route Handlers.
 * Deduplicates the network request to Supabase Auth during a single RSC render.
 * DO NOT use this in Middleware.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  return supabase.auth.getUser();
});

/**
 * Cached tournament lookup for Server Components.
 */
export const getTournament = cache(async (id: string) => {
  const supabase = await createClient();
  return supabase
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();
});

/**
 * Cached membership lookup for Server Components.
 */
export const getTournamentMembership = cache(async (tournamentId: string, userId: string) => {
  const supabase = await createClient();
  return supabase
    .from('tournament_members')
    .select('role')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .eq('role', 'ORGANIZER')
    .eq('status', 'ACTIVE')
    .single();
});
