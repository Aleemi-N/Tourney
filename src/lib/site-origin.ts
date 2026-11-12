/**
 * The website's public address, for redirects built on the server. Behind a proxy (Coolify, Caddy) the request the server
 * sees is addressed to the container (http://localhost:3000), so its own URL must not be used for links people follow.
 */
export function siteOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  return request ? new URL(request.url).origin : 'http://localhost:3000';
}
