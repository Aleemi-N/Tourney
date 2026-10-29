import type { StoredSession } from './core';

/**
 * The website keeps a visitor signed in with two cookies:
 * - `tourny-access` holds the short-lived access token and when it runs out. Scripts in the page can read it, because the
 *   browser's own requests to the API need it.
 * - `tourny-refresh` holds the 30-day refresh token and is HttpOnly: no script can read it, so a script-injection bug cannot
 *   steal a long-lived sign-in. Only the website's server reads it, to renew the access token.
 */
export const ACCESS_COOKIE = 'tourny-access';
export const REFRESH_COOKIE = 'tourny-refresh';
export const PKCE_COOKIE = 'tourny-pkce';

const DAY = 60 * 60 * 24;
// Secure wherever the API is served over https (every real deployment); plain http is only for local development.
const secure = process.env.NEXT_PUBLIC_API_URL?.startsWith('https:') ?? false;
// The access cookie outlives the token, so an expired one is still there to say "renew me".
export const accessOptions = { path: '/', sameSite: 'lax' as const, maxAge: 365 * DAY, secure };
export const refreshOptions = { path: '/', sameSite: 'lax' as const, maxAge: 30 * DAY, secure, httpOnly: true };

const toBase64Url = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));

export function encodeAccess(session: Pick<StoredSession, 'access_token' | 'expires_at'>): string {
  return toBase64Url({ a: session.access_token, e: session.expires_at });
}

/** The access half of a session. `refresh_token` is empty where only the access cookie can be read (the browser). */
export function decodeAccess(value: string | undefined, refreshToken = ''): StoredSession | null {
  if (!value) return null;
  try {
    const raw = fromBase64Url(value);
    return typeof raw.a === 'string' && typeof raw.e === 'number' ? { access_token: raw.a, refresh_token: refreshToken, expires_at: raw.e } : null;
  } catch {
    return null;
  }
}
