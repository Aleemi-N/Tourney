'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

function participantActionError(message: string, subject: 'registration' | 'application') {
  const normalized = message.toLowerCase();
  if (normalized.includes('status: rejected')) {
    return `This ${subject} is already rejected.`;
  }
  if (normalized.includes('status: approved') || normalized.includes('already approved')) {
    return `This ${subject} is already approved.`;
  }
  if (normalized.includes('not found')) {
    return `This ${subject} could not be found. It may have changed.`;
  }
  if (normalized.includes('unauthorized')) {
    return 'You no longer have permission to manage this tournament.';
  }
  return `Unable to update this ${subject}. Please refresh and try again.`;
}

type CorrectionResult = { ok?: boolean; code?: string; status?: string };

function correctionError(result: CorrectionResult | null, action: 'revoke' | 'reopen') {
  switch (result?.code) {
    case 'DOWNSTREAM_ASSIGNMENTS':
      return "This player's approval cannot be changed because they already have tournament assignments.";
    case 'INVALID_STATUS':
      return action === 'revoke'
        ? 'This registration is no longer approved.'
        : 'This registration is no longer rejected.';
    case 'REGISTRATION_NOT_FOUND':
      return 'This registration could not be found. It may have changed.';
    case 'UNAUTHORIZED':
      return 'You no longer have permission to manage this tournament.';
    case 'REASON_TOO_LONG':
      return 'The optional reason must be 1,000 characters or fewer.';
    default:
      return `Unable to ${action} this player decision. Please refresh and try again.`;
  }
}

export async function approvePlayerAction(registrationId: string, classification?: string | null, notes?: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('approve_player_registration', {
    p_registration_id: registrationId,
    p_auction_category: classification || undefined,
    p_notes: notes || undefined
  });

  if (error) {
    return { error: participantActionError(error.message, 'registration') };
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
    return { error: participantActionError(error.message, 'registration') };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

export async function revokePlayerApprovalAction(registrationId: string, reason?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('revoke_player_approval', {
    p_registration_id: registrationId,
    p_reason: reason || undefined,
  });

  if (error) return { error: 'Unable to revoke this player decision. Please refresh and try again.' };
  const result = data as CorrectionResult | null;
  if (!result?.ok) return { error: correctionError(result, 'revoke') };

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

export async function reopenPlayerRegistrationAction(registrationId: string, reason?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reopen_player_registration', {
    p_registration_id: registrationId,
    p_reason: reason || undefined,
  });

  if (error) return { error: 'Unable to reopen this player application. Please refresh and try again.' };
  const result = data as CorrectionResult | null;
  if (!result?.ok) return { error: correctionError(result, 'reopen') };

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
    return { error: participantActionError(error.message, 'application') };
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
    return { error: participantActionError(error.message, 'application') };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

// ─── Manual player registration (organizer adds a player directly) ─────────────

export interface ManualRegisterPayload {
  tournamentId: string;
  displayName: string;
  phone: string;
  email?: string;
  primaryPosition?: string;
  secondaryPosition?: string;
  jerseyName?: string;
  jerseyNumber?: number | null;
  jerseySize?: string;
  heightCm?: number | null;
  place?: string;
  notes?: string;
}

const MANUAL_REG_ERRORS: Record<string, string> = {
  UNAUTHORIZED:         'You no longer have permission to manage this tournament.',
  TOURNAMENT_NOT_OPEN:  'This tournament is not currently open for registration.',
  NAME_REQUIRED:        'Player name is required.',
  PHONE_REQUIRED:       'Phone number is required.',
};

export async function manualRegisterPlayerAction(payload: ManualRegisterPayload) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('organizer_register_player', {
    p_tournament_id:      payload.tournamentId,
    p_display_name:       payload.displayName,
    p_phone:              payload.phone,
    p_email:              payload.email              || null,
    p_primary_position:   payload.primaryPosition    || null,
    p_secondary_position: payload.secondaryPosition  || null,
    p_jersey_name:        payload.jerseyName         || null,
    p_jersey_number:      payload.jerseyNumber       ?? null,
    p_jersey_size:        payload.jerseySize         || null,
    p_height_cm:          payload.heightCm           ?? null,
    p_place:              payload.place              || null,
    p_notes:              payload.notes              || null,
  });

  if (error) {
    return { error: 'Unable to add player. Please try again.' };
  }

  const result = data as { ok: boolean; code?: string } | null;
  if (!result?.ok) {
    return { error: MANUAL_REG_ERRORS[result?.code ?? ''] ?? 'Unable to add player. Please try again.' };
  }

  revalidatePath('/organizer/tournaments/[id]/participants', 'page');
  return { success: true };
}

