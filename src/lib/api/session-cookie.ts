import type { StoredSession } from './core';

/** The cookie that keeps a visitor signed in on the website: the two tokens and when the access token runs out. */
export const SESSION_COOKIE = 'tourny-session';
export const PKCE_COOKIE = 'tourny-pkce';

const YEAR = 60 * 60 * 24 * 365;
export const cookieOptions = { path: '/', sameSite: 'lax' as const, maxAge: YEAR };

export function encodeSession(session: StoredSession): string {
  return btoa(JSON.stringify({ a: session.access_token, r: session.refresh_token, e: session.expires_at })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSession(value: string | undefined): StoredSession | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof raw.a === 'string' && typeof raw.r === 'string' && typeof raw.e === 'number' ? { access_token: raw.a, refresh_token: raw.r, expires_at: raw.e } : null;
  } catch {
    return null;
  }
}
