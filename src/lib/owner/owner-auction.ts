export type OwnerSnapshot = {
    auction?: { id: string; tournament_id: string; status: string; state_version: number };
    current_player?: {
        auction_player_id: string;
        base_price: number;
        category_code: string | null;
        category_label: string | null;
        category_base_price: number | null;
        state_version: number;
        player: {
            display_name: string;
            photo_path: string | null;
            primary_position: string | null;
            secondary_position: string | null;
        };
    } | null;
    highest_bid?: {
        id: string;
        amount: number;
        team: { id: string; name: string; short_name: string | null };
    } | null;
    team?: {
        id?: string;
        remaining_purse: number;
        spent_purse: number;
        active_squad: number;
        minimum_squad: number;
        maximum_squad: number;
        protected_reserve: number;
        max_allowed_bid: number;
        may_bid: boolean;
        blocked_reason: string | null;
    };
    next_minimum_bid?: number;
    last_sequence?: number;
};

export type OwnerSquadPlayer = {
    id: string;
    player_id: string;
    acquisition_type: string;
    acquisition_amount: number | null;
    player: {
        display_name: string;
        photo_path: string | null;
        primary_position: string | null;
        secondary_position: string | null;
    } | null;
};
