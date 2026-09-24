export type LotType = 'ICON' | 'SETTER';

export type LotPlayer = {
  id: string;
  display_name: string;
  photo_path?: string | null;
  primary_position: string;
  secondary_position?: string | null;
};

export type LotCard = {
  lot_number: number;
  status: string;
  selected_by_team_id?: string | null;
  selected_at?: string | null;
  player?: LotPlayer | null;
};

export type LotTurn = {
  id: string;
  team_id: string;
  turn_order: number;
  round_number: number;
  status: string;
};

export type LotSession = {
  id: string;
  tournament_id: string;
  lot_type: LotType;
  status: string;
};

export type OrganizerLotState = {
  session: LotSession;
  turns: LotTurn[];
  eligible_players: LotPlayer[];
  cards: LotCard[];
};

export type PublicLotState = {
  session: LotSession;
  current_turn: LotTurn | null;
  cards: LotCard[];
  last_sequence: number;
};

export function isLotDrawEnabled(format?: string | null, leagueMode?: string | null, iconMethod?: string | null, setterMethod?: string | null) {
  return format === 'LEAGUE' && leagueMode === 'AUCTION' && (iconMethod === 'LOT_DRAW' || setterMethod === 'LOT_DRAW');
}

export function applicableLotTypes(iconMethod?: string | null, setterMethod?: string | null): LotType[] {
  return [iconMethod === 'LOT_DRAW' ? 'ICON' : null, setterMethod === 'LOT_DRAW' ? 'SETTER' : null].filter(Boolean) as LotType[];
}

export function lotLabel(type: LotType) {
  return type === 'ICON' ? 'Icon Player Lot' : 'Setter Lot';
}

export function safeLotError(message?: string) {
  const value = message?.toLowerCase() ?? '';
  if (value.includes('unauthorized')) return 'You are not authorized to operate this lot.';
  if (value.includes('stale')) return 'Another tab advanced the draw. The latest state has been restored.';
  if (value.includes('already selected')) return 'That card was already selected. Choose an available card.';
  if (value.includes('no longer eligible')) return 'The selected player is no longer eligible. Refresh and review the draw.';
  if (value.includes('capacity') || value.includes('squad')) return 'A team no longer has enough squad capacity.';
  if (value.includes('already exists')) return 'An operational session already exists for this lot type.';
  if (value.includes('empty')) return 'No eligible players are available for this lot.';
  if (value.includes('not lot_draw') || value.includes('requires an auction league')) return 'Lot Draw is no longer configured for this tournament.';
  if (value.includes('cancel')) return 'This session can no longer be cancelled.';
  return 'The operation could not be completed. Refresh and try again.';
}
