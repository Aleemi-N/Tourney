'use server';

import { createClient } from '@/lib/api/server';
import { revalidatePath } from 'next/cache';
import type { AuctionCategoryCode } from '@/lib/organizer/organizer-auction';

// ─── Settings actions ─────────────────────────────────────────────────────────

export async function updateAuctionPriceCategoriesAction(
  tournamentId: string,
  categories: {
    a_name: string; a_price: number;
    b_name: string; b_price: number;
    c_name: string; c_price: number;
  }
) {
  const api = await createClient();
  const { data, error } = await api.rpc('update_auction_price_categories', {
    p_tournament_id: tournamentId,
    p_a_name: categories.a_name,
    p_a_price: categories.a_price,
    p_b_name: categories.b_name,
    p_b_price: categories.b_price,
    p_c_name: categories.c_name,
    p_c_price: categories.c_price,
  });

  if (error) {
    const v = error.message.toLowerCase();
    if (v.includes('locked after preparation')) {
      return { error: 'Auction category configuration is locked after preparation.' };
    }
    if (v.includes('a >= b >= c')) {
      return { error: 'Category prices must satisfy A ≥ B ≥ C > 0.' };
    }
    if (v.includes('display name')) {
      return { error: 'Category display names are required (max 80 characters each).' };
    }
    if (v.includes('unauthorized')) {
      return { error: 'You are not authorized to update auction categories.' };
    }
    return { error: 'Unable to update auction price categories. Please try again.' };
  }

  revalidatePath(`/organizer/tournaments/${tournamentId}/settings`);
  revalidatePath(`/organizer/tournaments/${tournamentId}/auction`);
  revalidatePath(`/organizer/tournaments/${tournamentId}/participants`);
  return { ok: true, data };
}

// ─── Participant classification action ────────────────────────────────────────

export async function classifyAuctionPlayerAction(
  registrationId: string,
  auctionCategory: string,
  auctionPriceCategoryId: string | null,
  notes?: string | null
) {
  const api = await createClient();
  const { error } = await api.rpc('approve_player_registration', {
    p_registration_id: registrationId,
    p_auction_category: auctionCategory,
    p_notes: notes || undefined,
    p_auction_price_category_id: auctionPriceCategoryId || undefined,
  });

  if (error) {
    const v = error.message.toLowerCase();
    if (v.includes('auction price category is required')) {
      return { error: 'An A/B/C price category is required for this player.' };
    }
    if (v.includes('must not have an auction price category')) {
      return { error: 'Lot Draw players must not have an auction price category.' };
    }
    if (v.includes('locked after auction preparation')) {
      return { error: 'Classification is locked after auction preparation.' };
    }
    if (v.includes('locked by downstream')) {
      return { error: 'Classification is locked by an existing team assignment.' };
    }
    if (v.includes('unauthorized')) {
      return { error: 'You are not authorized to classify this player.' };
    }
    return { error: 'Unable to update player classification. Please try again.' };
  }

  revalidatePath(`/organizer/tournaments/[id]/participants`, 'page');
  return { ok: true };
}

// ─── Auction lifecycle actions ────────────────────────────────────────────────

export async function prepareAuctionAction(tournamentId: string) {
  const api = await createClient();
  const { data, error } = await api.rpc('prepare_auction', {
    p_tournament_id: tournamentId,
  });
  if (error) {
    return { error: error.message };
  }
  revalidatePath(`/organizer/tournaments/${tournamentId}/auction`);
  return { ok: true, data };
}

export async function setAuctionLifecycleAction(
  auctionId: string,
  action: 'START' | 'PAUSE' | 'RESUME',
  expectedVersion: number,
  requestKey: string
) {
  const api = await createClient();
  const { data, error } = await api.rpc('set_auction_lifecycle', {
    p_auction_id: auctionId,
    p_action: action,
    p_expected_version: expectedVersion,
    p_request_key: requestKey,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

export async function openNextAuctionPlayerAction(
  auctionId: string,
  expectedVersion: number,
  requestKey: string,
  targetAuctionPlayerId?: string | null
) {
  const api = await createClient();
  const { data, error } = await api.rpc('open_next_auction_player', {
    p_auction_id: auctionId,
    p_expected_version: expectedVersion,
    p_request_key: requestKey,
    p_target_auction_player_id: targetAuctionPlayerId ?? null,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

export async function finalizeAuctionSaleAction(
  auctionId: string,
  auctionPlayerId: string,
  expectedPlayerVersion: number,
  expectedWinningBidId: string,
  requestKey: string
) {
  const api = await createClient();
  const { data, error } = await api.rpc('finalize_auction_sale', {
    p_auction_id: auctionId,
    p_auction_player_id: auctionPlayerId,
    p_expected_player_version: expectedPlayerVersion,
    p_expected_winning_bid_id: expectedWinningBidId,
    p_request_key: requestKey,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

export async function markAuctionPlayerUnsoldAction(
  auctionId: string,
  auctionPlayerId: string,
  expectedPlayerVersion: number,
  requestKey: string
) {
  const api = await createClient();
  const { data, error } = await api.rpc('mark_auction_player_unsold', {
    p_auction_id: auctionId,
    p_auction_player_id: auctionPlayerId,
    p_expected_player_version: expectedPlayerVersion,
    p_request_key: requestKey,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}


export async function requeueAuctionPlayerAction(
  auctionId: string,
  auctionPlayerId: string,
  expectedPlayerVersion: number,
  requestKey: string,
  newPrice?: number
) {
  const api = await createClient();
  const { data, error } = await api.rpc('requeue_auction_player', {
    p_auction_id: auctionId,
    p_auction_player_id: auctionPlayerId,
    p_expected_player_version: expectedPlayerVersion,
    p_request_key: requestKey,
    p_new_price: newPrice,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

export async function completeAuctionAction(
  auctionId: string,
  expectedVersion: number,
  requestKey: string
) {
  const api = await createClient();
  const { data, error } = await api.rpc('complete_auction', {
    p_auction_id: auctionId,
    p_expected_version: expectedVersion,
    p_request_key: requestKey,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

// ─── Category classification helper used in ParticipantManager ────────────────

export type CategoryClassification = {
  allocationRoute: string;      // MAIN_AUCTION | ICON_LOT | SETTER_LOT
  priceCategoryId: string | null;
  priceCategoryCode: AuctionCategoryCode | null;
};

export async function quickAddPlayerToAuctionAction(
  auctionId: string,
  priceCategoryId: string,
  existingPlayerId?: string,
  displayName?: string,
  primaryPosition?: string,
  secondaryPosition?: string,
  phone?: string
) {
  const api = await createClient();
  const { data, error } = await api.rpc('quick_add_player_to_live_auction', {
    p_auction_id: auctionId,
    p_auction_price_category_id: priceCategoryId,
    p_existing_player_id: existingPlayerId || undefined,
    p_display_name: displayName || undefined,
    p_primary_position: primaryPosition || undefined,
    p_secondary_position: secondaryPosition || undefined,
    p_phone: phone || undefined,
  });
  if (error) {
    return { error: error.message };
  }
  return { ok: true, data };
}

export type EligiblePlayerResult = {
  id: string;
  display_name: string;
  primary_position: string;
  photo_path: string | null;
  registration_status: string;
  allocation_route: string | null;
};

export async function getEligiblePlayersAction(tournamentId: string) {
  const api = await createClient();

  // 1. Get all registrations for this tournament that are APPROVED or REJECTED/REVOKED
  const { data: regs, error: regError } = await api
    .from('player_tournament_registrations')
    .select(`
      player_id,
      status,
      auction_category,
      player_profiles (
        id,
        display_name,
        primary_position,
        photo_path
      )
    `)
    .eq('tournament_id', tournamentId)
    .in('status', ['APPROVED', 'REJECTED', 'REVOKED']);

  if (regError) {
    return { error: regError.message };
  }

  // 2. Get existing auction players
  const { data: auctionPlayers, error: auctionError } = await api
    .from('auctions')
    .select(`
      id,
      auction_players (
        player_id
      )
    `)
    .eq('tournament_id', tournamentId)
    .maybeSingle();

  if (auctionError) {
    return { error: auctionError.message };
  }

  const existingPlayerIds = new Set(
    (auctionPlayers?.auction_players || []).map((ap: { player_id: string }) => ap.player_id)
  );

  // 3. Filter out players already in the auction
  const eligible = (regs || [])
    .filter((r) => r.player_profiles && !existingPlayerIds.has(r.player_id))
    .map((r) => ({
      id: r.player_profiles.id,
      display_name: r.player_profiles.display_name,
      primary_position: r.player_profiles.primary_position,
      photo_path: r.player_profiles.photo_path,
      registration_status: r.status,
      allocation_route: r.auction_category,
    }));

  return { ok: true, data: eligible };
}
