import { cookies } from 'next/headers';
import { cache } from 'react';
import { Api } from './core';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessOptions, decodeAccess, encodeAccess, refreshOptions } from './session-cookie';
import type { Database } from './types';

/**
 * API client for Server Components and Route Handlers.
 *
 * Do NOT share this client across requests — always call createClient() fresh.
 * Do NOT use this in Client Components or the proxy.
 *
 * The session comes from the visitor's cookie. A renewed session is written back where cookies can be set (server
 * actions, route handlers); in a Server Component that fails quietly, and the proxy has already renewed it.
 *
 * Architecture rule: server controls authoritative state — never trust
 * client-supplied values for competitive tournament state.
 */
export async function createClient(): Promise<Api<Database>> {
  const cookieStore = await cookies();
  return new Api<Database>(process.env.NEXT_PUBLIC_API_URL!, {
    store: {
      get: () => decodeAccess(cookieStore.get(ACCESS_COOKIE)?.value, cookieStore.get(REFRESH_COOKIE)?.value ?? ''),
      set: (session) => {
        if (session) {
          cookieStore.set(ACCESS_COOKIE, encodeAccess(session), accessOptions);
          cookieStore.set(REFRESH_COOKIE, session.refresh_token, refreshOptions);
        } else {
          cookieStore.delete(ACCESS_COOKIE);
          cookieStore.delete(REFRESH_COOKIE);
        }
      },
    },
  });
}

/**
 * Cached getUser for Server Components and Route Handlers.
 * Deduplicates the network request to the API during a single RSC render.
 * DO NOT use this in Middleware.
 */
export const getUser = cache(async () => {
  const api = await createClient();
  return api.auth.getUser();
});

/**
 * Cached tournament lookup for Server Components.
 */
export const getTournament = cache(async (id: string) => {
  const api = await createClient();
  return api
    .from('tournaments')
    .select('*')
    .eq('id', id)
    .single();
});

/**
 * Cached membership lookup for Server Components.
 */
export const getTournamentMembership = cache(async (tournamentId: string, userId: string) => {
  const api = await createClient();
  return api
    .from('tournament_members')
    .select('role')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .eq('role', 'ORGANIZER')
    .eq('status', 'ACTIVE')
    .single();
});
