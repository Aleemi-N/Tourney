import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/api/session-cookie';

/** Clears both session cookies. The browser cannot clear the HttpOnly one itself. */
export async function POST() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
