import { NextResponse } from 'next/server';
import { createClient } from '@/lib/api/server';

/**
 * Renews the signed-in session for the browser. The refresh token is in an HttpOnly cookie that only this server can read;
 * the answer carries the new access token, and the cookies are set on this response.
 */
export async function POST() {
  const api = await createClient();
  const { data } = await api.auth.getSession();
  if (!data.session) return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ access_token: data.session.access_token, expires_at: data.session.expires_at }, { headers: { 'Cache-Control': 'no-store' } });
}
