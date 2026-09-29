import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/types';

/**
 * Next.js Proxy (previously "middleware") — Supabase session refresh.
 *
 * In Next.js 16+, the `middleware` file convention is renamed to `proxy`.
 * The exported function is named `proxy` (previously `middleware`).
 *
 * Runs before every matched request to refresh the Supabase auth session.
 * This ensures Server Components can read a valid session via the server
 * client without re-triggering a token refresh mid-render.
 *
 * Uses the current @supabase/ssr getAll/setAll API including the `headers`
 * argument, which must be forwarded to the response to prevent CDN caching
 * of auth cookie responses.
 *
 * IMPORTANT: This does NOT perform authorization. Authorization must always
 * be enforced server-side via RLS and RPC. Never rely on cookie checks here
 * as the sole authorization mechanism — UI hiding is not security.
 *
 * Super Admin authorization is enforced in the layout server component via
 * the is_platform_super_admin() RPC — NOT here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Update the internal Next.js cookies map
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          // Explicitly serialize the updated cookies back into the raw 'cookie' HTTP header.
          // Without this, Server Components will not see the refreshed session!
          const requestHeaders = new Headers(request.headers);
          const cookieHeader = request.cookies
            .getAll()
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');
          requestHeaders.set('cookie', cookieHeader);

          // Pass the explicitly modified headers forward to Server Components
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });

          // Set the cookies on the outbound response to update the browser
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );

          // Apply any standard headers provided by Supabase
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

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
    request.nextUrl.pathname.startsWith('/owner/');

  if (isOrganizerRoute || isSuperAdminRoute || isProtectedAccountRoute) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('next', request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

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
     * Keeping static assets out of the proxy avoids unnecessary Supabase
     * client instantiation on every asset request.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|woff|woff2|ttf|otf)$).*)',
  ],
};
