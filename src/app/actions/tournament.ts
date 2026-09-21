/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { createClient, getUser } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// Update or create draft tournament
export async function saveTournamentDraft(data: any) {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) {
    return { error: 'Unauthorized' };
  }

  try {
    let result;

    if (data.id) {
      // Update existing draft using RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('update_tournament_draft', {
        p_tournament_id: data.id,
        p_name: data.name || null,
        p_slug: data.slug || null,
        p_description: data.description || null,
        p_format: data.format || null,
        p_league_mode: data.league_mode || null,
        p_settings: data.settings || null,
        p_vball_rules: data.volleyball_rules || null
      });

      if (rpcError) {
        console.error('Tournament UPDATE error:', JSON.stringify(rpcError));
        throw rpcError;
      }
      result = rpcData;
    } else {
      // Create new draft using RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_tournament_draft', {
        p_name: data.name || 'Untitled',
        p_slug: data.slug || `draft-${Date.now()}`,
        p_description: data.description || null,
        p_format: data.format || 'KNOCKOUT',
        p_league_mode: (data.league_mode && data.format === 'LEAGUE') ? data.league_mode : null,
        p_settings: data.settings || null,
        p_vball_rules: data.volleyball_rules || null
      });

      if (rpcError) {
        console.error('Tournament CREATE error:', JSON.stringify(rpcError));
        throw rpcError;
      }
      result = rpcData;
    }

    return { success: true, id: (result as any)?.tournament_id };
  } catch (err: any) {
    console.error('Error saving draft:', err);
    
    // Safely handle Supabase PostgrestError
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      // Known custom RPC validation errors use PT prefix
      if (typeof err.code === 'string' && err.code.startsWith('PT')) {
        return { error: err.message };
      }
      // Hide internal database errors from the user but log them
      return { error: 'A database error occurred while saving the draft.' };
    }
    
    return { error: err instanceof Error ? err.message : 'Failed to save tournament draft.' };
  }
}

export async function publishTournament(tournamentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await getUser();

  if (!user) return { error: 'Unauthorized' };

  // Fetch slug first to revalidate specific route cache
  const { data: tourny } = await supabase
    .from('tournaments')
    .select('slug')
    .eq('id', tournamentId)
    .single();

  // Set status to REGISTRATION and mark as publicly discoverable.
  // is_public=true is what makes the tournament visible in the homepage discovery section.
  const { error } = await supabase
    .from('tournaments')
    .update({ status: 'REGISTRATION', is_public: true })
    .eq('id', tournamentId);

  if (error) {
    return { error: error.message };
  }

  // Revalidate both the organizer dashboard AND the public homepage so the
  // newly published tournament appears immediately without a manual hard refresh.
  // In intermediate draft saves, we intentionally DO NOT revalidatePath('/organizer/dashboard')
  // here. The UI uses local React state to transition instantly.
  // Revalidation happens only on final publish.
  revalidatePath('/organizer/dashboard');
  revalidatePath('/');
  if (tourny?.slug) {
    revalidatePath(`/t/${tourny.slug}`, 'page');
  }
  return { success: true };
}
