'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSafeRedirectUrl } from '@/lib/utils/url';
import { headers } from 'next/headers';

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const nextUrl = formData.get('nextUrl') as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  
  redirect(getSafeRedirectUrl(nextUrl, '/'));
}

export async function register(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const fullName = formData.get('fullName') as string;
  const nextUrl = formData.get('nextUrl') as string;

  if (!email || !password || !fullName) {
    return { error: 'All fields are required.' };
  }

  // Step 1: Create auth user. signUp establishes the session.
  const { data: authData, error: authError } = await supabase.auth.signUp({
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

  // Basic profile created (by triggers in DB). Do NOT initialize organization.
  
  revalidatePath('/', 'layout');
  redirect(getSafeRedirectUrl(nextUrl, '/'));
}

export async function completeOrganizerOnboarding(formData: FormData) {
  const supabase = await createClient();
  const orgName = formData.get('orgName') as string;
  const orgSlug = formData.get('orgSlug') as string;
  const nextUrl = formData.get('nextUrl') as string;
  
  if (!orgName || !orgSlug) {
    return { error: 'Organization name and slug are required.' };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to create an organization.' };
  }

  const fullName = user.user_metadata?.full_name || 'Organizer';

  const { error: onboardingError } = await supabase.rpc(
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
  const supabase = await createClient();
  const email = formData.get('email') as string;
  
  if (!email) {
    return { error: 'Email is required' };
  }

  const headerList = await headers();
  const origin = headerList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    console.error('Password reset request error:', error);
    // Neutral fallback - don't expose enumeration
  }

  return { success: true };
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { error: 'Both fields are required' };
  }
  
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const { error } = await supabase.auth.updateUser({
    password: password
  });

  if (error) {
    return { error: error.message };
  }
  
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
