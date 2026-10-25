/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@/lib/supabase/server';
import { ParticipantManager } from './ParticipantManager';

export async function ParticipantListServer({
  tournament
}: {
  tournament: any
}) {
  const supabase = await createClient();

  const isAuctionLeague =
    tournament.format === 'LEAGUE' && tournament.league_mode === 'AUCTION';

  // Fetch player registrations, team owner applications, and (for auction) categories + settings
  const [
    { data: players },
    { data: teamOwners },
    auctionCategoriesResult,
    settingsResult,
  ] = await Promise.all([
    supabase
      .from('player_tournament_registrations')
      .select(`
        id,
        status,
        auction_category,
        auction_price_category_id,
        player_profiles (
          id,
          display_name,
          primary_position,
          secondary_position,
          photo_path,
          place,
          height_cm,
          phone,
          date_of_birth,
          playing_history,
          jersey_name,
          jersey_number,
          jersey_size
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('team_owner_applications')
      .select(`
        id,
        proposed_team_name,
        team_short_name,
        logo_path,
        primary_color,
        secondary_color,
        place,
        status,
        profiles:user_id (
          full_name
        )
      `)
      .eq('tournament_id', tournament.id)
      .order('created_at', { ascending: false }),
    isAuctionLeague
      ? supabase
        .from('tournament_auction_categories')
        .select('id,category_code,display_name,base_price,display_order')
        .eq('tournament_id', tournament.id)
        .order('display_order')
      : Promise.resolve({ data: null }),
    isAuctionLeague
      ? supabase
        .from('tournament_settings')
        .select('icon_selection_method,setter_selection_method')
        .eq('tournament_id', tournament.id)
        .single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <ParticipantManager
      tournament={tournament}
      players={players || []}
      teamOwners={teamOwners || []}
      auctionCategories={
        isAuctionLeague && auctionCategoriesResult.data
          ? (auctionCategoriesResult.data as any[]).map((c) => ({
            id: c.id as string,
            code: c.category_code as string,
            display_name: c.display_name as string,
            base_price: c.base_price as number,
            display_order: c.display_order as number,
          }))
          : []
      }
      tournamentSettings={
        isAuctionLeague && settingsResult.data
          ? {
            icon_selection_method: (settingsResult.data as any).icon_selection_method as string,
            setter_selection_method: (settingsResult.data as any).setter_selection_method as string,
          }
          : null
      }
    />
  );
}
