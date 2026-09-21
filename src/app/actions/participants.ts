'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function approvePlayerAction(registrationId: string, classification?: string | null, notes?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_player_registration', {
    p_registration_id: registrationId,
    p_auction_category: classification || undefined,
    p_notes: notes || undefined
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

export async function rejectPlayerAction(registrationId: string, notes?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_player_registration', {
    p_registration_id: registrationId,
    p_notes: notes || undefined
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

export async function approveTeamOwnerAction(applicationId: string, notes?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_team_owner_application', {
    p_application_id: applicationId,
    p_notes: notes || undefined
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

export async function rejectTeamOwnerAction(applicationId: string, notes?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reject_team_owner_application', {
    p_application_id: applicationId,
    p_notes: notes || undefined
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}
