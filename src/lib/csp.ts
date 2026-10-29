/**
 * The Content-Security-Policy of every page. Scripts run only when they carry this request's nonce (or were loaded by a script
 * that does), so a script injected into a page by a bug cannot run. The embeddable widgets under /embed may be framed by any
 * site; everything else only by this one.
 */
export function contentSecurityPolicy(options: { nonce: string; pathname: string; apiUrl?: string; development?: boolean }): string {
  const api = options.apiUrl ? new URL(options.apiUrl) : null;
  const apiOrigin = api ? api.origin : '';
  const apiSocket = api ? `${api.protocol === 'https:' ? 'wss:' : 'ws:'}//${api.host}` : '';
  const embeddable = options.pathname === '/embed' || options.pathname.startsWith('/embed/');
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.development ? " 'unsafe-eval'" : ''}`,
    // Inline style attributes are everywhere in the UI libraries; styles cannot run code.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${apiOrigin}`.trim(),
    `font-src 'self' data:`,
    `connect-src 'self' ${apiOrigin} ${apiSocket}`.trim(),
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors ${embeddable ? '*' : "'self'"}`,
  ];
  if (!options.development && api?.protocol === 'https:') directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
