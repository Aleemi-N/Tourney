import type { MetadataRoute } from 'next';
import { getCanonicalOrigin } from '@/lib/origin';

// Public tournament pages may be indexed; signed-in portals and APIs may not.
export default function robots(): MetadataRoute.Robots {
  const origin = getCanonicalOrigin();
  return {
    rules: [{ userAgent: '*', allow: ['/', '/t/'], disallow: ['/organizer', '/player', '/scorer', '/owner', '/super-admin', '/api/', '/auth/', '/login', '/register', '/forgot-password', '/reset-password'] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
