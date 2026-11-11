/**
 * How the website's own server reaches the API.
 *
 * With API_INTERNAL_URL set (http://api:8080 in the Coolify and VPS setups) it calls the API inside the server: no DNS, no
 * round trip through the internet and Cloudflare. Browsers keep using NEXT_PUBLIC_API_URL, so image links stay public.
 */
export const apiUrlForServer = () => process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL!;

/**
 * The visitor's address, passed on to the API so its per-address limits (sign-in, sign-up, password reset) count visitors
 * and not this server, which makes every server-side call. The API believes it only with the shared API_INTERNAL_KEY, and
 * the key is only sent over the internal address, never across the internet.
 */
export function visitorHeaders(header: (name: string) => string | null | undefined): Record<string, string> | undefined {
  const key = process.env.API_INTERNAL_KEY;
  if (!key || !process.env.API_INTERNAL_URL) return undefined;
  const address = header('cf-connecting-ip') || header('x-forwarded-for')?.split(',')[0]?.trim() || header('x-real-ip');
  return address ? { 'X-Tourny-Internal-Key': key, 'X-Tourny-Visitor-IP': address } : undefined;
}
