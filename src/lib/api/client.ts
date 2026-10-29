'use client';

import { Api } from './core';
import { ACCESS_COOKIE, accessOptions, decodeAccess, encodeAccess } from './session-cookie';
import type { Database } from './types';

let browserClient: Api<Database> | undefined;

const attributes = (maxAge: number) => `path=${accessOptions.path}; max-age=${maxAge}; samesite=lax${accessOptions.secure ? '; secure' : ''}`;

/**
 * The API client for Client Components ('use client'). One per page: it listens for sign-in changes and renews the session.
 *
 * The page can read only the access token. Renewing goes through the website's own server (/session/refresh), which holds the
 * refresh token in an HttpOnly cookie; signing out clears both cookies there (/session/end). Signing in happens in server
 * actions, never here.
 */
export function createClient(): Api<Database> {
  return (browserClient ??= new Api<Database>(process.env.NEXT_PUBLIC_API_URL!, {
    store: {
      get: () => decodeAccess(document.cookie.split('; ').find((c) => c.startsWith(`${ACCESS_COOKIE}=`))?.slice(ACCESS_COOKIE.length + 1)),
      set: async (session) => {
        if (session) document.cookie = `${ACCESS_COOKIE}=${encodeAccess(session)}; ${attributes(accessOptions.maxAge)}`;
        else {
          document.cookie = `${ACCESS_COOKIE}=; ${attributes(0)}`;
          await fetch('/session/end', { method: 'POST' }).catch(() => {}); // only the server can clear the HttpOnly one
        }
      },
      renew: async () => {
        const response = await fetch('/session/refresh', { method: 'POST' });
        if (!response.ok) return null;
        const { access_token, expires_at } = await response.json();
        return { access_token, refresh_token: '', expires_at };
      },
    },
  }));
}
