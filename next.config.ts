import type { NextConfig } from 'next';

/**
 * Next.js configuration — Volleyball Tournament Platform V1.
 *
 * Supabase Storage hostname is NOT configured here because the Supabase
 * project URL is not yet available. Once you have a Supabase project,
 * add the storage hostname to images.remotePatterns so next/image can
 * optimise player photos, team logos, and tournament assets.
 *
 * Example (add after creating the Supabase project):
 *
 *   images: {
 *     remotePatterns: [
 *       {
 *         protocol: 'https',
 *         hostname: '<project-ref>.supabase.co',
 *         pathname: '/storage/v1/object/public/**',
 *       },
 *     ],
 *   },
 */
// The API (or Supabase) that serves storage objects, taken from the same variable the clients use.
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig: NextConfig = {
  // Strict mode helps catch potential issues early in development.
  reactStrictMode: true,

  // Image configuration — allow images from Supabase Storage
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'uxvsjchdfsznyyqbjrdm.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/public/**',
      },
      ...(apiUrl
        ? [{
            protocol: apiUrl.protocol.replace(':', '') as 'http' | 'https',
            hostname: apiUrl.hostname,
            ...(apiUrl.port ? { port: apiUrl.port } : {}),
            pathname: '/storage/v1/object/public/**',
          }]
        : []),
    ],
  },

  // Baseline security headers on every response (HSTS is set by the reverse proxy, which knows it serves HTTPS).
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    ];
    return [
      // Everything except the embeddable widgets may only be framed by this site.
      { source: '/:path((?!embed(?:/|$)).*)', headers: [...common, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
      // /embed/* is read-only public data meant to be placed on other websites.
      { source: '/embed/:path*', headers: [...common, { key: 'Content-Security-Policy', value: 'frame-ancestors *' }] },
    ];
  },

  // Experimental — placeholder for future flags (e.g. partial prerendering).
  experimental: {},
};

export default nextConfig;
