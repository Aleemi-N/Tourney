import type { NextConfig } from 'next';

/** Next.js configuration — Volleyball Tournament Platform. */
// The API serves stored images (logos, avatars, player photos); next/image may optimise them from the address the clients use.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL) : null;

const nextConfig: NextConfig = {
  // Strict mode helps catch potential issues early in development.
  reactStrictMode: true,

  images: {
    remotePatterns: apiUrl
      ? [{
          protocol: apiUrl.protocol.replace(':', '') as 'http' | 'https',
          hostname: apiUrl.hostname,
          ...(apiUrl.port ? { port: apiUrl.port } : {}),
          pathname: '/storage/object/public/**',
        }]
      : [],
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
      // /embed/* is read-only public data meant to be placed on other websites (the proxy sets its Content-Security-Policy with frame-ancestors *).
      { source: '/embed/:path*', headers: common },
    ];
  },

  // Experimental — placeholder for future flags (e.g. partial prerendering).
  experimental: {},
};

export default nextConfig;
