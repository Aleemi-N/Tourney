import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PKCE_COOKIE } from '@/lib/api/session-cookie';
import { createClient } from '@/lib/api/server';
import { getSafeRedirectUrl } from '@/lib/utils/url';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // "next" may only be a path on this site; anything else (https://evil.example, //evil.example) falls back.
  const next = getSafeRedirectUrl(searchParams.get('next'), '/player');

  if (code) {
    const api = await createClient();
    const jar = await cookies();
    const verifier = jar.get(PKCE_COOKIE)?.value;
    const { error } = verifier ? await api.auth.exchangeCode(code, verifier) : { error: true };
    jar.delete(PKCE_COOKIE);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Invalid+or+expired+link`);
}
