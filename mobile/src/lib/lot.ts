// Types and helpers of the lot draw, the same as the website's lib/lot-draw.ts.
export type LotType = 'ICON' | 'SETTER';
export type LotPlayer = { id: string; display_name: string; photo_path?: string | null; primary_position: string; secondary_position?: string | null };
export type LotCard = { lot_number: number; status: string; selected_by_team_id?: string | null; player?: LotPlayer | null };
export type LotTurn = { id: string; team_id: string; turn_order: number; round_number: number; status: string };
export type LotSession = { id: string; tournament_id: string; lot_type: LotType; status: string; cancellation_reason?: string | null };
export type OrganizerLotState = { session: LotSession; turns: LotTurn[]; eligible_players: LotPlayer[]; cards: LotCard[] };

export function applicableLotTypes(iconMethod?: string | null, setterMethod?: string | null): LotType[] {
  return [iconMethod === 'LOT_DRAW' ? 'ICON' : null, setterMethod === 'LOT_DRAW' ? 'SETTER' : null].filter(Boolean) as LotType[];
}

export const lotLabel = (type: LotType) => (type === 'ICON' ? 'Icon Player Lot' : 'Setter Lot');

export function safeLotError(message?: string) {
  const value = message?.toLowerCase() ?? '';
  if (value.includes('unauthorized')) return 'You are not authorized to operate this lot.';
  if (value.includes('stale')) return 'Another device advanced the draw. The latest state has been restored.';
  if (value.includes('already selected')) return 'That card was already selected. Choose an available card.';
  if (value.includes('no longer eligible')) return 'The selected player is no longer eligible. Refresh and review the draw.';
  if (value.includes('capacity') || value.includes('squad')) return 'A team no longer has enough squad capacity.';
  if (value.includes('already exists')) return 'An operational session already exists for this lot type.';
  if (value.includes('empty')) return 'No eligible players are available for this lot.';
  if (value.includes('not lot_draw') || value.includes('requires an auction league')) return 'Lot Draw is no longer configured for this tournament.';
  if (value.includes('cancel')) return 'This session can no longer be cancelled.';
  return 'The operation could not be completed. Refresh and try again.';
}

/** A random key so a retried card selection is applied once. */
export const requestKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
