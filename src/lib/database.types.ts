export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      auction_bids: {
        Row: {
          amount: number
          auction_id: string
          auction_player_id: string
          created_at: string
          expected_player_version: number
          id: string
          idempotency_key: string
          source: string
          submitted_by: string
          team_id: string
        }
        Insert: {
          amount: number
          auction_id: string
          auction_player_id: string
          created_at?: string
          expected_player_version?: number
          id?: string
          idempotency_key: string
          source: string
          submitted_by: string
          team_id: string
        }
        Update: {
          amount?: number
          auction_id?: string
          auction_player_id?: string
          created_at?: string
          expected_player_version?: number
          id?: string
          idempotency_key?: string
          source?: string
          submitted_by?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_auction_player_id_fkey"
            columns: ["auction_player_id"]
            isOneToOne: false
            referencedRelation: "auction_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_operation_requests: {
        Row: {
          auction_id: string
          created_at: string
          created_by: string
          id: string
          operation: string
          request_fingerprint: Json
          request_key: string
          result: Json | null
        }
        Insert: {
          auction_id: string
          created_at?: string
          created_by: string
          id?: string
          operation: string
          request_fingerprint: Json
          request_key: string
          result?: Json | null
        }
        Update: {
          auction_id?: string
          created_at?: string
          created_by?: string
          id?: string
          operation?: string
          request_fingerprint?: Json
          request_key?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_operation_requests_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_operation_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_players: {
        Row: {
          attempt_number: number
          auction_id: string
          auction_order: number
          auction_price_category_id: string | null
          base_price: number
          category_base_price: number | null
          category_code: string | null
          category_label: string | null
          created_at: string
          id: string
          live_started_at: string | null
          original_base_price: number
          player_id: string
          state_version: number
          status: string
          terminal_at: string | null
        }
        Insert: {
          attempt_number?: number
          auction_id: string
          auction_order: number
          auction_price_category_id?: string | null
          base_price: number
          category_base_price?: number | null
          category_code?: string | null
          category_label?: string | null
          created_at?: string
          id?: string
          live_started_at?: string | null
          original_base_price: number
          player_id: string
          state_version?: number
          status?: string
          terminal_at?: string | null
        }
        Update: {
          attempt_number?: number
          auction_id?: string
          auction_order?: number
          auction_price_category_id?: string | null
          base_price?: number
          category_base_price?: number | null
          category_code?: string | null
          category_label?: string | null
          created_at?: string
          id?: string
          live_started_at?: string | null
          original_base_price?: number
          player_id?: string
          state_version?: number
          status?: string
          terminal_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_player_category_same_tournament_fk"
            columns: ["auction_price_category_id"]
            isOneToOne: false
            referencedRelation: "tournament_auction_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_players_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_player_view"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_public_events: {
        Row: {
          auction_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          sequence_number: number
          tournament_id: string
        }
        Insert: {
          auction_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          sequence_number: number
          tournament_id: string
        }
        Update: {
          auction_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          sequence_number?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_public_events_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_public_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_public_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_sales: {
        Row: {
          auction_player_id: string
          confirmed_by: string
          id: string
          sold_amount: number
          sold_at: string
          team_id: string
          winning_bid_id: string
        }
        Insert: {
          auction_player_id: string
          confirmed_by: string
          id?: string
          sold_amount: number
          sold_at?: string
          team_id: string
          winning_bid_id: string
        }
        Update: {
          auction_player_id?: string
          confirmed_by?: string
          id?: string
          sold_amount?: number
          sold_at?: string
          team_id?: string
          winning_bid_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_sales_auction_player_id_fkey"
            columns: ["auction_player_id"]
            isOneToOne: true
            referencedRelation: "auction_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sales_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sales_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sales_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_sales_winning_bid_id_fkey"
            columns: ["winning_bid_id"]
            isOneToOne: true
            referencedRelation: "auction_bids"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_team_wallets: {
        Row: {
          auction_id: string
          id: string
          remaining_balance: number
          spent_amount: number
          starting_balance: number
          team_id: string
          updated_at: string
        }
        Insert: {
          auction_id: string
          id?: string
          remaining_balance: number
          spent_amount?: number
          starting_balance: number
          team_id: string
          updated_at?: string
        }
        Update: {
          auction_id?: string
          id?: string
          remaining_balance?: number
          spent_amount?: number
          starting_balance?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_team_wallets_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_team_wallets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_team_wallets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      auctions: {
        Row: {
          completed_at: string | null
          created_at: string
          event_sequence: number
          id: string
          minimum_acquisition_reserve_price: number | null
          minimum_bid_increment: number
          paused_at: string | null
          prepared_at: string | null
          started_at: string | null
          starting_purse: number
          state_version: number
          status: string
          tournament_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          event_sequence?: number
          id?: string
          minimum_acquisition_reserve_price?: number | null
          minimum_bid_increment: number
          paused_at?: string | null
          prepared_at?: string | null
          started_at?: string | null
          starting_purse: number
          state_version?: number
          status?: string
          tournament_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          event_sequence?: number
          id?: string
          minimum_acquisition_reserve_price?: number | null
          minimum_bid_increment?: number
          paused_at?: string | null
          prepared_at?: string | null
          started_at?: string | null
          starting_purse?: number
          state_version?: number
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auctions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auctions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          organization_id: string | null
          reason: string | null
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          organization_id?: string | null
          reason?: string | null
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          organization_id?: string | null
          reason?: string | null
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_entries: {
        Row: {
          id: string
          lot_number: number
          lot_session_id: string
          player_id: string
          selected_at: string | null
          selected_by_team_id: string | null
          status: string
        }
        Insert: {
          id?: string
          lot_number: number
          lot_session_id: string
          player_id: string
          selected_at?: string | null
          selected_by_team_id?: string | null
          status?: string
        }
        Update: {
          id?: string
          lot_number?: number
          lot_session_id?: string
          player_id?: string
          selected_at?: string | null
          selected_by_team_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_entries_lot_session_id_fkey"
            columns: ["lot_session_id"]
            isOneToOne: false
            referencedRelation: "lot_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_player_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_selected_by_team_id_fkey"
            columns: ["selected_by_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_selected_by_team_id_fkey"
            columns: ["selected_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_public_events: {
        Row: {
          card_number: number | null
          created_at: string
          event_type: string
          id: string
          lot_session_id: string
          lot_type: string
          payload: Json
          sequence_number: number
          session_status: string
          team_id: string | null
          tournament_id: string
          turn_id: string | null
        }
        Insert: {
          card_number?: number | null
          created_at?: string
          event_type: string
          id?: string
          lot_session_id: string
          lot_type: string
          payload?: Json
          sequence_number: number
          session_status: string
          team_id?: string | null
          tournament_id: string
          turn_id?: string | null
        }
        Update: {
          card_number?: number | null
          created_at?: string
          event_type?: string
          id?: string
          lot_session_id?: string
          lot_type?: string
          payload?: Json
          sequence_number?: number
          session_status?: string
          team_id?: string | null
          tournament_id?: string
          turn_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_public_events_lot_session_id_fkey"
            columns: ["lot_session_id"]
            isOneToOne: false
            referencedRelation: "lot_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_public_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_public_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_public_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_public_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_sessions: {
        Row: {
          cancellation_reason: string | null
          cancelled_by: string | null
          created_at: string
          created_by: string
          id: string
          locked_at: string | null
          lot_type: string
          shuffled_at: string | null
          status: string
          tournament_id: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by: string
          id?: string
          locked_at?: string | null
          lot_type: string
          shuffled_at?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_by?: string | null
          created_at?: string
          created_by?: string
          id?: string
          locked_at?: string | null
          lot_type?: string
          shuffled_at?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_sessions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_sessions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_turns: {
        Row: {
          completed_at: string | null
          id: string
          lot_session_id: string
          round_number: number
          selected_entry_id: string | null
          selection_request_key: string | null
          started_at: string | null
          status: string
          team_id: string
          turn_order: number
        }
        Insert: {
          completed_at?: string | null
          id?: string
          lot_session_id: string
          round_number?: number
          selected_entry_id?: string | null
          selection_request_key?: string | null
          started_at?: string | null
          status?: string
          team_id: string
          turn_order: number
        }
        Update: {
          completed_at?: string | null
          id?: string
          lot_session_id?: string
          round_number?: number
          selected_entry_id?: string | null
          selection_request_key?: string | null
          started_at?: string | null
          status?: string
          team_id?: string
          turn_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lot_turns_lot_session_id_fkey"
            columns: ["lot_session_id"]
            isOneToOne: false
            referencedRelation: "lot_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_turns_selected_entry_id_fkey"
            columns: ["selected_entry_id"]
            isOneToOne: false
            referencedRelation: "lot_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_turns_selected_entry_id_fkey"
            columns: ["selected_entry_id"]
            isOneToOne: false
            referencedRelation: "public_revealed_lot_state"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_turns_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_turns_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      match_scorers: {
        Row: {
          assigned_at: string
          assigned_by: string
          match_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          match_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          match_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_scorers_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scorers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scorers_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_fixture_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_scorers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_sets: {
        Row: {
          away_score: number
          completed_at: string | null
          home_score: number
          id: string
          match_id: string
          set_number: number
          started_at: string | null
          status: string
          target_points: number
          winner_team_id: string | null
        }
        Insert: {
          away_score?: number
          completed_at?: string | null
          home_score?: number
          id?: string
          match_id: string
          set_number: number
          started_at?: string | null
          status?: string
          target_points: number
          winner_team_id?: string | null
        }
        Update: {
          away_score?: number
          completed_at?: string | null
          home_score?: number
          id?: string
          match_id?: string
          set_number?: number
          started_at?: string | null
          status?: string
          target_points?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sets_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_fixture_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sets_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_sets_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_team_id: string | null
          bracket_position: number | null
          court: string | null
          created_at: string
          home_team_id: string | null
          id: string
          match_number: number | null
          next_match_id: string | null
          next_match_slot: string | null
          round_number: number | null
          scheduled_at: string | null
          stage_id: string | null
          status: string
          tournament_id: string
          updated_at: string
          venue: string | null
          winner_team_id: string | null
        }
        Insert: {
          away_team_id?: string | null
          bracket_position?: number | null
          court?: string | null
          created_at?: string
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          next_match_id?: string | null
          next_match_slot?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          stage_id?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
          venue?: string | null
          winner_team_id?: string | null
        }
        Update: {
          away_team_id?: string | null
          bracket_position?: number | null
          court?: string | null
          created_at?: string
          home_team_id?: string | null
          id?: string
          match_number?: number | null
          next_match_id?: string | null
          next_match_slot?: string | null
          round_number?: number | null
          scheduled_at?: string | null
          stage_id?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
          venue?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "public_fixture_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data_json: Json
          id: string
          message: string
          notification_type: string
          read_at: string | null
          title: string
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          data_json?: Json
          id?: string
          message: string
          notification_type: string
          read_at?: string | null
          title: string
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          data_json?: Json
          id?: string
          message?: string
          notification_type?: string
          read_at?: string | null
          title?: string
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          logo_path: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_path?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_path?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          created_at: string
          date_of_birth: string | null
          display_name: string
          height_cm: number | null
          id: string
          phone: string | null
          photo_path: string | null
          place: string | null
          playing_history: string | null
          primary_position: string
          secondary_position: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          display_name: string
          height_cm?: number | null
          id?: string
          phone?: string | null
          photo_path?: string | null
          place?: string | null
          playing_history?: string | null
          primary_position: string
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          display_name?: string
          height_cm?: number | null
          id?: string
          phone?: string | null
          photo_path?: string | null
          place?: string | null
          playing_history?: string | null
          primary_position?: string
          secondary_position?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      player_tournament_registrations: {
        Row: {
          auction_category: string | null
          auction_price_category_id: string | null
          created_at: string
          id: string
          player_id: string
          registration_number: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          auction_category?: string | null
          auction_price_category_id?: string | null
          created_at?: string
          id?: string
          player_id: string
          registration_number?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          auction_category?: string | null
          auction_price_category_id?: string | null
          created_at?: string
          id?: string
          player_id?: string
          registration_number?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_tournament_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tournament_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_player_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tournament_registrations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_auction_price_category_fk"
            columns: ["tournament_id", "auction_price_category_id"]
            isOneToOne: false
            referencedRelation: "tournament_auction_categories"
            referencedColumns: ["tournament_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      purse_transactions: {
        Row: {
          amount: number
          auction_sale_id: string | null
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string
          id: string
          player_id: string | null
          reason: string | null
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          auction_sale_id?: string | null
          balance_after: number
          balance_before: number
          created_at?: string
          created_by: string
          id?: string
          player_id?: string | null
          reason?: string | null
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          auction_sale_id?: string | null
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string
          id?: string
          player_id?: string | null
          reason?: string | null
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purse_transactions_auction_sale_id_fkey"
            columns: ["auction_sale_id"]
            isOneToOne: false
            referencedRelation: "auction_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purse_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purse_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purse_transactions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_player_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purse_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "auction_team_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      score_events: {
        Row: {
          away_score_after: number
          created_at: string
          created_by: string
          event_type: string
          home_score_after: number
          id: string
          idempotency_key: string | null
          match_id: string
          match_set_id: string
          sequence_number: number
          team_id: string | null
        }
        Insert: {
          away_score_after: number
          created_at?: string
          created_by: string
          event_type: string
          home_score_after: number
          id?: string
          idempotency_key?: string | null
          match_id: string
          match_set_id: string
          sequence_number: number
          team_id?: string | null
        }
        Update: {
          away_score_after?: number
          created_at?: string
          created_by?: string
          event_type?: string
          home_score_after?: number
          id?: string
          idempotency_key?: string | null
          match_id?: string
          match_set_id?: string
          sequence_number?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "public_fixture_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_match_set_id_fkey"
            columns: ["match_set_id"]
            isOneToOne: false
            referencedRelation: "match_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_events_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          created_at: string
          display_order: number
          id: string
          logo_path: string | null
          name: string
          tournament_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          logo_path?: string | null
          name: string
          tournament_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          logo_path?: string | null
          name?: string
          tournament_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          league_points: number
          lost: number
          played: number
          points_against: number
          points_for: number
          sets_lost: number
          sets_won: number
          stage_id: string
          team_id: string
          tournament_id: string
          updated_at: string
          won: number
        }
        Insert: {
          league_points?: number
          lost?: number
          played?: number
          points_against?: number
          points_for?: number
          sets_lost?: number
          sets_won?: number
          stage_id: string
          team_id: string
          tournament_id: string
          updated_at?: string
          won?: number
        }
        Update: {
          league_points?: number
          lost?: number
          played?: number
          points_against?: number
          points_for?: number
          sets_lost?: number
          sets_won?: number
          stage_id?: string
          team_id?: string
          tournament_id?: string
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      standings_rules: {
        Row: {
          loss_points: number
          stage_id: string
          tie_break_rules: Json
          updated_at: string
          walkover_points: number | null
          win_points: number
        }
        Insert: {
          loss_points?: number
          stage_id: string
          tie_break_rules?: Json
          updated_at?: string
          walkover_points?: number | null
          win_points?: number
        }
        Update: {
          loss_points?: number
          stage_id?: string
          tie_break_rules?: Json
          updated_at?: string
          walkover_points?: number | null
          win_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: true
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      team_owner_applications: {
        Row: {
          created_at: string
          email: string | null
          id: string
          logo_path: string | null
          phone: string | null
          place: string | null
          proposed_team_name: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          team_short_name: string | null
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          phone?: string | null
          place?: string | null
          proposed_team_name: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_short_name?: string | null
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          logo_path?: string | null
          phone?: string | null
          place?: string | null
          proposed_team_name?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          team_short_name?: string | null
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_owner_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owner_applications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owner_applications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owner_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_owner_invites: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          invite_code: string
          invited_email: string | null
          invited_phone: string | null
          tournament_id: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          invite_code: string
          invited_email?: string | null
          invited_phone?: string | null
          tournament_id: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          invite_code?: string
          invited_email?: string | null
          invited_phone?: string | null
          tournament_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_owner_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owner_invites_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owner_invites_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      team_owners: {
        Row: {
          created_at: string
          is_primary: boolean
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_owners_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owners_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_players: {
        Row: {
          acquisition_amount: number | null
          acquisition_type: string
          id: string
          joined_at: string
          player_id: string
          status: string
          team_id: string
          tournament_id: string
        }
        Insert: {
          acquisition_amount?: number | null
          acquisition_type: string
          id?: string
          joined_at?: string
          player_id: string
          status?: string
          team_id: string
          tournament_id: string
        }
        Update: {
          acquisition_amount?: number | null
          acquisition_type?: string
          id?: string
          joined_at?: string
          player_id?: string
          status?: string
          team_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "player_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "public_player_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          logo_path: string | null
          name: string
          place: string | null
          primary_color: string | null
          secondary_color: string | null
          short_name: string | null
          status: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_path?: string | null
          name: string
          place?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_path?: string | null
          name?: string
          place?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          short_name?: string | null
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          created_at: string
          id: string
          layout_json: Json
          name: string
          status: string
          template_type: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          layout_json?: Json
          name: string
          status?: string
          template_type: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          layout_json?: Json
          name?: string
          status?: string
          template_type?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_auction_categories: {
        Row: {
          base_price: number
          category_code: string
          created_at: string
          display_name: string
          display_order: number
          id: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          base_price: number
          category_code: string
          created_at?: string
          display_name: string
          display_order: number
          id?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_code?: string
          created_at?: string
          display_name?: string
          display_order?: number
          id?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_auction_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_auction_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_branding: {
        Row: {
          background_path: string | null
          font_preferences: Json
          logo_path: string | null
          primary_color: string | null
          secondary_color: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          background_path?: string | null
          font_preferences?: Json
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          background_path?: string | null
          font_preferences?: Json
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_branding_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_branding_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_members: {
        Row: {
          created_at: string
          role: string
          status: string
          team_id: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          status?: string
          team_id?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          status?: string
          team_id?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_members_team_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_team_fk"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_settings: {
        Row: {
          auction_base_price: number | null
          auction_bid_increment: number | null
          auction_starting_purse: number | null
          created_at: string
          icon_selection_method: string
          max_squad_size: number | null
          max_teams: number | null
          min_squad_size: number
          owner_registration_mode: string
          player_registration_enabled: boolean
          public_live_enabled: boolean
          reauction_price_rule: string
          setter_selection_method: string
          team_registration_enabled: boolean
          timezone: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          auction_base_price?: number | null
          auction_bid_increment?: number | null
          auction_starting_purse?: number | null
          created_at?: string
          icon_selection_method?: string
          max_squad_size?: number | null
          max_teams?: number | null
          min_squad_size?: number
          owner_registration_mode?: string
          player_registration_enabled?: boolean
          public_live_enabled?: boolean
          reauction_price_rule?: string
          setter_selection_method?: string
          team_registration_enabled?: boolean
          timezone?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          auction_base_price?: number | null
          auction_bid_increment?: number | null
          auction_starting_purse?: number | null
          created_at?: string
          icon_selection_method?: string
          max_squad_size?: number | null
          max_teams?: number | null
          min_squad_size?: number
          owner_registration_mode?: string
          player_registration_enabled?: boolean
          public_live_enabled?: boolean
          reauction_price_rule?: string
          setter_selection_method?: string
          team_registration_enabled?: boolean
          timezone?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_settings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_settings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_stages: {
        Row: {
          created_at: string
          id: string
          name: string
          qualification_count: number | null
          sequence: number
          stage_type: string
          status: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          qualification_count?: number | null
          sequence: number
          stage_type: string
          status?: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          qualification_count?: number | null
          sequence?: number
          stage_type?: string
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_stages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_stages_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          format: string
          id: string
          is_public: boolean
          league_mode: string | null
          name: string
          organization_id: string
          registration_end: string | null
          registration_start: string | null
          slug: string
          sport: string
          start_date: string | null
          status: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          format: string
          id?: string
          is_public?: boolean
          league_mode?: string | null
          name: string
          organization_id: string
          registration_end?: string | null
          registration_start?: string | null
          slug: string
          sport?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          format?: string
          id?: string
          is_public?: boolean
          league_mode?: string | null
          name?: string
          organization_id?: string
          registration_end?: string | null
          registration_start?: string | null
          slug?: string
          sport?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      volleyball_rules: {
        Row: {
          created_at: string
          id: string
          sets_to_win: number
          stage_id: string | null
          tournament_id: string
          updated_at: string
          win_by_two: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          sets_to_win: number
          stage_id?: string | null
          tournament_id: string
          updated_at?: string
          win_by_two?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          sets_to_win?: number
          stage_id?: string | null
          tournament_id?: string
          updated_at?: string
          win_by_two?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "volleyball_rules_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volleyball_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volleyball_rules_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      volleyball_set_rules: {
        Row: {
          id: string
          set_number: number
          target_points: number
          volleyball_rule_id: string
        }
        Insert: {
          id?: string
          set_number: number
          target_points: number
          volleyball_rule_id: string
        }
        Update: {
          id?: string
          set_number?: number
          target_points?: number
          volleyball_rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volleyball_set_rules_volleyball_rule_id_fkey"
            columns: ["volleyball_rule_id"]
            isOneToOne: false
            referencedRelation: "volleyball_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_fixture_view: {
        Row: {
          away_sets_won: number | null
          away_team_id: string | null
          court: string | null
          home_sets_won: number | null
          home_team_id: string | null
          id: string | null
          match_number: number | null
          next_match_id: string | null
          scheduled_at: string | null
          stage_id: string | null
          status: string | null
          total_away_score: number | null
          total_home_score: number | null
          tournament_id: string | null
          venue: string | null
          winner_team_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "public_fixture_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "tournament_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_player_view: {
        Row: {
          acquisition_type: string | null
          display_name: string | null
          height_cm: number | null
          id: string | null
          photo_path: string | null
          primary_position: string | null
          secondary_position: string | null
          team_id: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_revealed_lot_state: {
        Row: {
          id: string | null
          lot_number: number | null
          lot_session_id: string | null
          player_id: string | null
          player_name: string | null
          selected_at: string | null
          selected_by_team_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_entries_lot_session_id_fkey"
            columns: ["lot_session_id"]
            isOneToOne: false
            referencedRelation: "lot_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_selected_by_team_id_fkey"
            columns: ["selected_by_team_id"]
            isOneToOne: false
            referencedRelation: "public_team_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_entries_selected_by_team_id_fkey"
            columns: ["selected_by_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      public_team_view: {
        Row: {
          id: string | null
          logo_path: string | null
          name: string | null
          place: string | null
          primary_color: string | null
          secondary_color: string | null
          short_name: string | null
          status: string | null
          tournament_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "public_tournament_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      public_tournament_view: {
        Row: {
          background_path: string | null
          description: string | null
          end_date: string | null
          format: string | null
          id: string | null
          is_public: boolean | null
          logo_path: string | null
          name: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string | null
          sport: string | null
          start_date: string | null
          status: string | null
          venue: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      assign_player_manually: {
        Args: {
          p_tournament_id: string
          p_team_id: string
          p_player_id: string
        }
        Returns: Json
      }
      add_existing_player_to_live_auction: {
        Args: { p_auction_id: string; p_registration_id: string }
        Returns: Json
      }
      add_tournament_staff_role: {
        Args: { p_email: string; p_role: string; p_tournament_id: string }
        Returns: Json
      }
      approve_player_registration: {
        Args: {
          p_auction_category?: string
          p_auction_price_category_id?: string
          p_notes?: string
          p_registration_id: string
        }
        Returns: undefined
      }
      approve_team_owner_application: {
        Args: { p_application_id: string; p_notes?: string }
        Returns: undefined
      }
      assign_match_scorer: {
        Args: { p_match_id: string; p_scorer_user_id: string }
        Returns: Json
      }
      auction_player_is_eligible: {
        Args: { p_player_id: string; p_tournament_id: string }
        Returns: boolean
      }
      auction_request_begin: {
        Args: {
          p_auction_id: string
          p_fingerprint: Json
          p_operation: string
          p_request_key: string
        }
        Returns: Json
      }
      auction_request_finish: {
        Args: {
          p_auction_id: string
          p_operation: string
          p_request_key: string
          p_result: Json
        }
        Returns: Json
      }
      auction_team_finance: {
        Args: { p_auction_id: string; p_purchase?: number; p_team_id: string }
        Returns: Json
      }
      award_point: {
        Args: {
          p_idempotency_key: string
          p_match_id: string
          p_team_id: string
        }
        Returns: Json
      }
      cancel_lot_session: {
        Args: { p_lot_session_id: string; p_reason: string }
        Returns: undefined
      }
      complete_auction: {
        Args: {
          p_auction_id: string
          p_expected_version: number
          p_request_key: string
        }
        Returns: Json
      }
      create_tournament_draft: {
        Args: {
          p_description?: string
          p_format?: string
          p_league_mode?: string
          p_name: string
          p_settings?: Json
          p_slug: string
          p_vball_rules?: Json
        }
        Returns: Json
      }
      emit_auction_event: {
        Args: { p_auction_id: string; p_event_type: string; p_payload?: Json }
        Returns: number
      }
      emit_lot_event: {
        Args: {
          p_card?: number
          p_event_type: string
          p_payload?: Json
          p_session_id: string
          p_status: string
          p_team?: string
          p_turn?: string
        }
        Returns: undefined
      }
      finalize_auction_sale: {
        Args: {
          p_auction_id: string
          p_auction_player_id: string
          p_expected_player_version: number
          p_expected_winning_bid_id: string
          p_request_key: string
        }
        Returns: Json
      }
      generate_stage_fixtures: { Args: { p_stage_id: string }; Returns: Json }
      get_stage_standings: { Args: { p_stage_id: string }; Returns: Json }
      get_auction_organizer_state: {
        Args: { p_auction_id: string }
        Returns: Json
      }
      get_auction_owner_state: {
        Args: { p_auction_id: string; p_team_id: string }
        Returns: Json
      }
      get_auction_public_state: {
        Args: { p_auction_id: string }
        Returns: Json
      }
      get_auction_readiness: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      get_lot_organizer_state: {
        Args: { p_lot_session_id: string }
        Returns: Json
      }
      get_lot_public_state: {
        Args: { p_lot_session_id: string }
        Returns: Json
      }
      get_public_live_state: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      get_public_match_state: { Args: { p_match_id: string }; Returns: Json }
      get_public_standings: { Args: { p_tournament_id: string }; Returns: Json }
      get_scorer_match_state: { Args: { p_match_id: string }; Returns: Json }
      get_tournament_phase5a_configuration: {
        Args: { p_tournament_id: string }
        Returns: Json
      }
      get_tournament_staff: {
        Args: { p_tournament_id: string }
        Returns: {
          avatar_path: string
          display_name: string
          email: string
          is_primary_organizer: boolean
          membership_status: string
          roles: string[]
          user_id: string
        }[]
      }
      initialize_organizer_onboarding: {
        Args: { p_full_name: string; p_org_name: string; p_org_slug: string }
        Returns: Json
      }
      is_assigned_scorer: { Args: { m_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_organization_admin: { Args: { org_id: string }; Returns: boolean }
      is_primary_tournament_organizer: { Args: { tourn_id: string }; Returns: boolean }
      is_player_in_public_tournament: {
        Args: { p_id: string }
        Returns: boolean
      }
      is_player_registered_in_member_tournament: {
        Args: { p_id: string }
        Returns: boolean
      }
      is_player_registered_in_organizer_tournament: {
        Args: { p_id: string }
        Returns: boolean
      }
      is_team_owner: { Args: { t_id: string }; Returns: boolean }
      is_tournament_member: { Args: { tourn_id: string }; Returns: boolean }
      is_tournament_organizer: { Args: { tourn_id: string }; Returns: boolean }
      mark_auction_player_unsold: {
        Args: {
          p_auction_id: string
          p_auction_player_id: string
          p_expected_player_version: number
          p_request_key: string
        }
        Returns: Json
      }
      open_next_auction_player: {
        Args: {
          p_auction_id: string
          p_expected_version: number
          p_request_key: string
        }
        Returns: Json
      }
      place_auction_bid: {
        Args: {
          p_amount: number
          p_auction_id: string
          p_auction_player_id: string
          p_expected_highest_bid: number
          p_expected_player_version: number
          p_request_key: string
          p_team_id: string
        }
        Returns: Json
      }
      prepare_auction: { Args: { p_tournament_id: string }; Returns: Json }
      prepare_lot_session: {
        Args: {
          p_lot_type: string
          p_team_order: string[]
          p_tournament_id: string
        }
        Returns: string
      }
      quick_add_player_to_live_auction: {
        Args: {
          p_auction_id: string
          p_auction_price_category_id: string
          p_display_name?: string
          p_existing_player_id?: string
          p_phone?: string
          p_photo_path?: string
          p_primary_position?: string
          p_secondary_position?: string
        }
        Returns: Json
      }
      reject_player_registration: {
        Args: { p_notes?: string; p_registration_id: string }
        Returns: undefined
      }
      reject_team_owner_application: {
        Args: { p_application_id: string; p_notes?: string }
        Returns: undefined
      }
      remove_tournament_staff_role: {
        Args: {
          p_role: string
          p_target_user_id: string
          p_tournament_id: string
        }
        Returns: Json
      }
      rename_tournament_team: {
        Args: { p_name: string; p_team_id: string }
        Returns: Json
      }
      save_standings_rules: {
        Args: { p_loss_points: number; p_stage_id: string; p_tie_break_rules: Json; p_win_points: number }
        Returns: Json
      }
      reopen_player_registration: {
        Args: { p_reason?: string; p_registration_id: string }
        Returns: Json
      }
      requeue_auction_player: {
        Args: {
          p_auction_id: string
          p_auction_player_id: string
          p_expected_player_version: number
          p_new_price?: number
          p_request_key: string
        }
        Returns: Json
      }
      revoke_player_approval: {
        Args: { p_reason?: string; p_registration_id: string }
        Returns: Json
      }
      save_tournament_stage: {
        Args: {
          p_name: string
          p_qualification_count?: number
          p_sequence: number
          p_stage_id: string
          p_stage_type: string
          p_tournament_id: string
        }
        Returns: string
      }
      save_volleyball_rule: {
        Args: {
          p_set_rules: Json
          p_sets_to_win: number
          p_stage_id: string
          p_tournament_id: string
          p_win_by_two: boolean
        }
        Returns: string
      }
      select_lot: {
        Args: {
          p_expected_turn_id: string
          p_lot_number: number
          p_lot_session_id: string
          p_request_key: string
        }
        Returns: Json
      }
      set_auction_lifecycle: {
        Args: {
          p_action: string
          p_auction_id: string
          p_expected_version: number
          p_request_key: string
        }
        Returns: Json
      }
      set_reauction_price: {
        Args: {
          p_auction_id: string
          p_auction_player_id: string
          p_expected_player_version: number
          p_new_price: number
          p_request_key: string
        }
        Returns: Json
      }
      shuffle_lot_session: {
        Args: { p_lot_session_id: string }
        Returns: undefined
      }
      special_allocation_lock: {
        Args: { p_classification: string; p_tournament_id: string }
        Returns: Json
      }
      start_lot_session: {
        Args: { p_lot_session_id: string }
        Returns: undefined
      }
      submit_player_registration: {
        Args: {
          p_date_of_birth?: string
          p_display_name: string
          p_height_cm?: number
          p_phone?: string
          p_photo_path?: string
          p_place?: string
          p_playing_history?: string
          p_primary_position: string
          p_secondary_position?: string
          p_tournament_id: string
        }
        Returns: string
      }
      submit_team_owner_application: {
        Args: {
          p_email?: string
          p_logo_path?: string
          p_phone?: string
          p_place?: string
          p_proposed_team_name: string
          p_team_short_name?: string
          p_tournament_id: string
        }
        Returns: string
      }
      undo_last_score_event: { Args: { p_match_id: string }; Returns: Json }
      update_auction_price_categories: {
        Args: {
          p_a_name: string
          p_a_price: number
          p_b_name: string
          p_b_price: number
          p_c_name: string
          p_c_price: number
          p_tournament_id: string
        }
        Returns: Json
      }
      update_player_profile: {
        Args: {
          p_date_of_birth?: string
          p_display_name: string
          p_height_cm?: number
          p_phone?: string
          p_photo_path?: string
          p_place?: string
          p_playing_history?: string
          p_primary_position: string
          p_secondary_position?: string
        }
        Returns: string
      }
      update_tournament_details: {
        Args: {
          p_description?: string
          p_end_date?: string
          p_logo_path?: string
          p_name: string
          p_start_date?: string
          p_tournament_id: string
          p_venue?: string
        }
        Returns: Json
      }
      update_match_schedule: {
        Args: { p_court?: string | null; p_match_id: string; p_scheduled_at?: string | null; p_status?: string | null; p_venue?: string | null }
        Returns: Json
      }
      update_tournament_draft: {
        Args: {
          p_description?: string
          p_format?: string
          p_league_mode?: string
          p_name?: string
          p_settings?: Json
          p_slug?: string
          p_tournament_id: string
          p_vball_rules?: Json
        }
        Returns: Json
      }
      update_tournament_settings: {
        Args: {
          p_auction_base_price?: number
          p_auction_bid_increment?: number
          p_auction_starting_purse?: number
          p_icon_selection_method?: string
          p_max_squad_size?: number
          p_max_teams?: number
          p_min_squad_size?: number
          p_player_registration_enabled: boolean
          p_reauction_price_rule?: string
          p_setter_selection_method?: string
          p_team_registration_enabled: boolean
          p_tournament_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

