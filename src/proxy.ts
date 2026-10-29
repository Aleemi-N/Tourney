import { NextResponse, type NextRequest } from 'next/server';
import { Api } from '@/lib/api/core';
import { ACCESS_COOKIE, REFRESH_COOKIE, accessOptions, decodeAccess, encodeAccess, refreshOptions } from '@/lib/api/session-cookie';
import type { Database } from '@/lib/api/types';
import { contentSecurityPolicy } from '@/lib/csp';

/**
 * Next.js Proxy (previously "middleware") — keeps the signed-in session fresh.
 *
 * In Next.js 16+, the `middleware` file convention is renamed to `proxy`.
 * The exported function is named `proxy` (previously `middleware`).
 *
 * Runs before every matched request and renews the session cookie when the access token is about to expire.
 * This ensures Server Components read a valid session without having to renew it mid-render (they cannot set cookies).
 *
 * IMPORTANT: This does NOT perform authorization. Authorization must always
 * be enforced server-side via RLS and RPC. Never rely on cookie checks here
 * as the sole authorization mechanism — UI hiding is not security.
 *
 * Super Admin authorization is enforced in the layout server component via
 * the is_platform_super_admin() RPC — NOT here.
 */
export async function proxy(request: NextRequest) {
  // Every page gets a Content-Security-Policy with a fresh nonce; the root layout puts the nonce on its own script (it reads x-nonce).
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy({ nonce, pathname: request.nextUrl.pathname, apiUrl: process.env.NEXT_PUBLIC_API_URL, development: process.env.NODE_ENV === 'development' });
  const forwarded = new Headers(request.headers);
  forwarded.set('x-nonce', nonce);
  forwarded.set('Content-Security-Policy', csp);
  let response = NextResponse.next({ request: { headers: forwarded } });

  const api = new Api<Database>(process.env.NEXT_PUBLIC_API_URL!, {
    store: {
      get: () => decodeAccess(request.cookies.get(ACCESS_COOKIE)?.value, request.cookies.get(REFRESH_COOKIE)?.value ?? ''),
      set: (session) => {
        if (session) {
          request.cookies.set(ACCESS_COOKIE, encodeAccess(session));
          request.cookies.set(REFRESH_COOKIE, session.refresh_token);
        } else {
          request.cookies.delete(ACCESS_COOKIE);
          request.cookies.delete(REFRESH_COOKIE);
        }

        // Server Components read the request's cookie header, so the renewed session must be written into it,
        // otherwise they would see the old, expired one.
        const requestHeaders = new Headers(forwarded);
        requestHeaders.set('cookie', request.cookies.getAll().map((c) => `${c.name}=${c.value}`).join('; '));
        response = NextResponse.next({ request: { headers: requestHeaders } });

        // And the browser gets the new cookies.
        if (session) {
          response.cookies.set(ACCESS_COOKIE, encodeAccess(session), accessOptions);
          response.cookies.set(REFRESH_COOKIE, session.refresh_token, refreshOptions);
        } else {
          response.cookies.delete(ACCESS_COOKIE);
          response.cookies.delete(REFRESH_COOKIE);
        }
      },
    },
  });

  // Visitors who are not signed in have no cookie, so there is nothing to renew (and no request to make).
  if (request.cookies.has(REFRESH_COOKIE)) await api.auth.getSession();

  const isOrganizerRoute = request.nextUrl.pathname.startsWith('/organizer');

  // Super-admin routes require a session.
  // The layout server component performs the full is_platform_super_admin() RPC check.
  // Proxy only provides an early redirect to login if there is no session at all.
  const isSuperAdminRoute = request.nextUrl.pathname.startsWith('/super-admin');

  // Public registration shells and their metadata must remain crawlable.
  // Their Server Components still gate forms/data with auth.getUser().
  //
  // NOTE: The exact /player pathname must be listed explicitly.
  // startsWith('/player/') only matches sub-paths (/player/profile, etc.)
  // and misses the player home route itself, which caused the login loop:
  //   unauthenticated /player → page redirect('/login') with no ?next=
  //   → login succeeds → fallback '/' → player never reaches the portal.
  const isProtectedAccountRoute =
    request.nextUrl.pathname === '/player' ||
    request.nextUrl.pathname.startsWith('/player/') ||
    request.nextUrl.pathname === '/scorer' ||
    request.nextUrl.pathname.startsWith('/scorer/') ||
    request.nextUrl.pathname.startsWith('/owner/');

  if (isOrganizerRoute || isSuperAdminRoute || isProtectedAccountRoute) {
    const {
      data: { user },
    } = await api.auth.getUser();

    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('next', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static  (Next.js static files)
     * - _next/image   (Next.js image optimization)
     * - favicon.ico and common static asset extensions
     *
     * Keeping static assets out of the proxy avoids needless work on every asset request.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|woff|woff2|ttf|otf)$).*)',
  ],
};
