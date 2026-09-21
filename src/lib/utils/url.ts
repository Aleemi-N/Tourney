export function getSafeRedirectUrl(nextUrl: string | null | undefined, defaultUrl: string = '/'): string {
  if (!nextUrl) return defaultUrl;
  
  // Safe internal path must:
  // 1. Start with a single slash
  // 2. Not start with double slash (protocol relative bypass: //evil.example)
  // 3. Not start with slash-backslash (bypass: /\evil.example)
  // 4. Not be a javascript uri or contain malicious protocols
  try {
    // Basic structural validation
    if (nextUrl.startsWith('/') && !nextUrl.startsWith('//') && !nextUrl.startsWith('/\\')) {
      // Decode and check for embedded absolute URLs (e.g. Next.js router encoding issues)
      const decoded = decodeURIComponent(nextUrl);
      if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.startsWith('/\\')) {
        return nextUrl;
      }
    }
  } catch {
    // If decodeURIComponent fails on malformed input, fallback to default
    return defaultUrl;
  }
  
  return defaultUrl;
}
