'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

/**
 * Browser-side Supabase client.
 *
 * Use this in Client Components ('use client').
 * Do NOT use this in Server Components, Route Handlers, or Middleware.
 *
 * createBrowserClient handles cookie storage automatically via document.cookie.
 * No custom cookie configuration is required for standard browser usage.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
