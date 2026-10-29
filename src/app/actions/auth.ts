'use server';

import { createClient } from '@/lib/api/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '@/lib/utils/url';
import { cookies, headers } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { PKCE_COOKIE } from '@/lib/api/session-cookie';

export async function login(formData: FormData) {
  const api = await createClient();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const nextUrl = formData.get('nextUrl') as string;

  const { data, error } = await api.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');

  // Honor an explicit, validated next destination (e.g. set by the proxy when an
  // unauthenticated user tried to visit a protected route, or by a deep link).
  const safeNext = getSafeRedirectUrl(nextUrl, '');
  if (safeNext) {
    redirect(safeNext);
  }

  // No explicit next — route the user to the correct portal by role.
  // Order: super admin › organizer › team owner › player (default).
  // Scorers have no standalone portal; they land at /player and navigate
  // to assigned matches from there. This matches the scorer page's own guard.
  const userId = data.user?.id;
  if (userId) {
    // Super Admin: check via the same authoritative RPC used by the layout.
    const { data: isSuperAdmin } = await api.rpc('is_platform_super_admin');
    if (isSuperAdmin) redirect('/super-admin');

    // Organizer: has an active organization membership.
    const { data: orgMember } = await api
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();
    if (orgMember) redirect('/organizer/dashboard');

    // Team Owner: has an active team ownership record.
    const { data: teamOwner } = await api
      .from('team_owners')
      .select('team_id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();
    if (teamOwner) redirect('/owner/dashboard');
  }

  // Default destination: Player Portal.
  // Covers players, scorers, and brand-new accounts with no role yet.
  redirect('/player');
}

export async function register(formData: FormData) {
  const api = await createClient();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const nextUrl = formData.get('nextUrl') as string;

  if (!email || !password || !fullName) {
    return { error: 'All fields are required.' };
  }

  // Step 1: Create auth user. signUp establishes the session.
  const { data: authData, error: authError } = await api.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: 'Something went wrong during registration.' };
  }

  // The API returns a non-null user object even for duplicate emails when
  // email confirmation is disabled — but the identities array is empty.
  // This is a deliberate anti-enumeration measure of the sign-up endpoint.
  // We must check for it explicitly; otherwise the action silently redirects
  // to / as if registration succeeded, and the user can never sign in.
  if (!authData.user.identities || authData.user.identities.length === 0) {
    return { error: 'An account with this email already exists. Please sign in.' };
  }

  // Genuine new account — profile row created by on_auth_user_created trigger.
  // player_profiles is created later via the tournament registration RPC.
  revalidatePath('/', 'layout');
  redirect(getSafeRedirectUrl(nextUrl, '/player'));
}

export async function completeOrganizerOnboarding(formData: FormData) {
  const api = await createClient();
  const orgName = formData.get('orgName') as string;
  const orgSlug = formData.get('orgSlug') as string;
  const nextUrl = formData.get('nextUrl') as string;
  
  if (!orgName || !orgSlug) {
    return { error: 'Organization name and slug are required.' };
  }

  const { data: { user } } = await api.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to create an organization.' };
  }

  const fullName = user.user_metadata?.full_name || 'Organizer';

  const { error: onboardingError } = await api.rpc(
    'initialize_organizer_onboarding',
    {
      p_full_name: fullName,
      p_org_name: orgName,
      p_org_slug: orgSlug,
    }
  );

  if (onboardingError) {
    return { error: onboardingError.message };
  }

  revalidatePath('/', 'layout');
  redirect(getSafeRedirectUrl(nextUrl, '/organizer/dashboard'));
}

export async function requestPasswordReset(formData: FormData) {
  const api = await createClient();
  const email = formData.get('email') as string;
  
  if (!email) {
    return { error: 'Email is required' };
  }

  const headerList = await headers();
  const origin = headerList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  
  // The reset link comes back with a one-time code; only this browser, which holds the verifier, can trade it for a sign-in.
  const verifier = randomBytes(32).toString('base64url');
  (await cookies()).set(PKCE_COOKIE, verifier, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 });
  const { error } = await api.auth.requestPasswordReset(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  });

  if (error) {
    console.error('Password reset request error:', error);
    // Neutral fallback - don't expose enumeration
  }

  return { success: true };
}

export async function resetPassword(formData: FormData) {
  const api = await createClient();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { error: 'Both fields are required' };
  }
  
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  const { error } = await api.auth.updateUser({
    password: password
  });

  if (error) {
    return { error: error.message };
  }
  
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function logout() {
  const api = await createClient();
  await api.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
