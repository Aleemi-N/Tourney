'use client';

import { Api } from './core';
import { SESSION_COOKIE, cookieOptions, decodeSession, encodeSession } from './session-cookie';
import type { Database } from './types';

let browserClient: Api<Database> | undefined;

/**
 * The API client for Client Components ('use client'). One per page: it listens for sign-in changes and renews the
 * session, and the session lives in a cookie so Server Components see it too.
 */
export function createClient(): Api<Database> {
  return (browserClient ??= new Api<Database>(process.env.NEXT_PUBLIC_API_URL!, {
    store: {
      get: () => decodeSession(document.cookie.split('; ').find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1)),
      set: (session) => {
        document.cookie = session
          ? `${SESSION_COOKIE}=${encodeSession(session)}; path=${cookieOptions.path}; max-age=${cookieOptions.maxAge}; samesite=lax${cookieOptions.secure ? '; secure' : ''}`
          : `${SESSION_COOKIE}=; path=${cookieOptions.path}; max-age=0; samesite=lax${cookieOptions.secure ? '; secure' : ''}`;
      },
    },
  }));
}
