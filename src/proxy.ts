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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );

          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const isOrganizerRoute = request.nextUrl.pathname.startsWith('/organizer');
  const isProtectedPhase4Route = 
    request.nextUrl.pathname.match(/^\/t\/[^/]+\/register\/(player|team)$/) ||
    request.nextUrl.pathname.startsWith('/player/') ||
    request.nextUrl.pathname.startsWith('/owner/');

  if (isOrganizerRoute || isProtectedPhase4Route) {
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
