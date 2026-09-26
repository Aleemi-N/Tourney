/**
 * Canonical Application Origin Helper — Tourny
 *
 * Production canonical origin: https://tournyappfyniti.vercel.app
 * Provides a single, centralized source of truth for generating absolute URLs,
 * canonical links, OpenGraph metadata, and shareable registration URLs.
 */

export const TOURNY_PRODUCTION_ORIGIN = 'https://tournyappfyniti.vercel.app';

/**
 * Returns the authoritative origin for the current execution environment.
 * In production, this always resolves to https://tournyappfyniti.vercel.app.
 */
export function getCanonicalOrigin(): string {
  // If explicitly specified in environment, prioritize it
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, '');
  }

  // Browser environment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // For local testing on localhost or 127.0.0.1, preserve local port
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return window.location.origin;
    }
    // Any preview/custom domain or production web returns the authoritative origin
    return TOURNY_PRODUCTION_ORIGIN;
  }

  // Server environment
  if (process.env.NODE_ENV === 'production') {
    return TOURNY_PRODUCTION_ORIGIN;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/+$/, '');
  }

  return TOURNY_PRODUCTION_ORIGIN;
}

/**
 * Generates an absolute URL using the canonical origin.
 */
export function getAbsoluteUrl(path: string, origin?: string): string {
  const base = origin || getCanonicalOrigin();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
