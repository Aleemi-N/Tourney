# Volleyball Tournament Platform V1 --- Architecture & Database Schema

## 1. Architecture Summary

### Frontend

-   Next.js.
-   TypeScript.
-   Tailwind CSS.
-   Framer Motion.
-   PWA.

### Backend Platform

The Tourny API and PostgreSQL provide: - Auth. - PostgreSQL. - Realtime. - Storage. - RLS. -
PostgreSQL functions/RPC.

### Rendering

Use hybrid rendering: - Server Components/SSR/static rendering for
public/shareable pages and initial data where appropriate. - Client
Components for realtime, animations, forms, scoring, auction, lot, PWA
behavior, and highly interactive dashboards.

### Core Rule

The client is not authoritative for competitive state.

Critical state transitions execute through trusted PostgreSQL
functions/RPC under RLS/authorization.

## 2. High-Level System

``` text
Browser / Installed PWA
        |
        +-- Public Spectator UI
        +-- Organizer UI
        +-- Team Owner UI
        +-- Player UI
        +-- Scorer UI
        |
        v
Next.js
  |            \
  |             \-- Server Components / server-side API access
  |
  +-- API Browser Client
        |
        +-- Auth
        +-- PostgreSQL + RLS
        +-- RPC Functions
        +-- Realtime
        +-- Storage
```

## 3. Core Domain Relationships

``` text
auth.users
   |
profiles
   |
   +-----------------------+
   |                       |
organizations          player_profiles
   |                       |
organization_members      |
   |                       |
tournaments <--------------+
   |
   +-- tournament_members
   +-- tournament_settings
   +-- tournament_stages
   +-- volleyball_rules
   +-- teams
   +-- player_tournament_registrations
   +-- lot_sessions
   +-- auctions
   +-- matches
   +-- standings
   +-- branding/templates/sponsors
```

## 4. Recommended PostgreSQL Extensions

Use only where needed: - `pgcrypto` or native UUID generation support. -
`citext` optional for case-insensitive unique email-like fields if
application tables need it.

The API's accounts remain responsible for identity credentials.

## 5. Database Schema

The following is the target logical schema. Exact migration syntax may
evolve, but domain invariants should remain.

### 5.1 profiles

``` sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  avatar_path text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','SUSPENDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.2 organizations

``` sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.3 organization_members

``` sql
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','STAFF')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
```

### 5.4 tournaments

``` sql
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  sport text not null default 'VOLLEYBALL'
    check (sport = 'VOLLEYBALL'),
  format text not null
    check (format in ('LEAGUE','KNOCKOUT')),
  league_mode text
    check (league_mode in ('AUCTION','REGISTERED_TEAM')),
  venue text,
  description text,
  start_date date,
  end_date date,
  registration_start timestamptz,
  registration_end timestamptz,
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REGISTRATION','PREPARATION','LIVE','COMPLETED','ARCHIVED')),
  is_public boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  check (
    (format = 'LEAGUE' and league_mode is not null)
    or
    (format = 'KNOCKOUT' and league_mode is null)
  )
);
```

### 5.5 tournament_settings

``` sql
create table public.tournament_settings (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  max_teams integer check (max_teams is null or max_teams > 1),
  min_squad_size integer not null default 1 check (min_squad_size > 0),
  max_squad_size integer check (max_squad_size is null or max_squad_size > 0),
  player_registration_enabled boolean not null default true,
  owner_registration_mode text not null default 'OPEN'
    check (owner_registration_mode in ('OPEN','INVITE_ONLY','ORGANIZER_ADDED')),
  public_live_enabled boolean not null default true,
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_squad_size is null or max_squad_size >= min_squad_size)
);
```

### 5.6 tournament_members

``` sql
create table public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('ORGANIZER','TEAM_OWNER','PLAYER','SCORER')),
  team_id uuid,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  primary key (tournament_id, user_id, role)
);
```

`team_id` receives its FK after `teams` exists or via migration
ordering.

### 5.7 team_owner_invites

``` sql
create table public.team_owner_invites (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  invite_code text not null unique,
  invited_phone text,
  invited_email text,
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

### 5.8 team_owner_applications

``` sql
create table public.team_owner_applications (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  proposed_team_name text not null,
  team_short_name text,
  logo_path text,
  place text,
  phone text,
  email text,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED')),
  review_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);
```

### 5.9 teams

``` sql
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  short_name text,
  logo_path text,
  place text,
  primary_color text,
  secondary_color text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','WITHDRAWN','DISQUALIFIED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name)
);
```

Add FK:

``` sql
alter table public.tournament_members
  add constraint tournament_members_team_fk
  foreign key (team_id) references public.teams(id) on delete set null;
```

### 5.10 team_owners

``` sql
create table public.team_owners (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
```

Use a partial unique index to enforce at most one active primary owner
if desired.

### 5.11 player_profiles

``` sql
create table public.player_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete set null,
  display_name text not null,
  photo_path text,
  date_of_birth date,
  phone text,
  place text,
  height_cm numeric(5,2),
  primary_position text not null
    check (primary_position in (
      'SETTER','LIBERO','MIDDLE_BLOCKER',
      'OUTSIDE_HITTER','OPPOSITE','UNIVERSAL'
    )),
  secondary_position text
    check (
      secondary_position is null or secondary_position in (
        'SETTER','LIBERO','MIDDLE_BLOCKER',
        'OUTSIDE_HITTER','OPPOSITE','UNIVERSAL'
      )
    ),
  playing_history text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`user_id` nullable allows Organizer-created player records before
account claiming/linking.

### 5.12 player_tournament_registrations

``` sql
create table public.player_tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  registration_number text,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','REJECTED','CHANGES_REQUESTED','WITHDRAWN')),
  auction_category text
    check (auction_category in ('ICON_LOT','SETTER_LOT','MAIN_AUCTION')),
  review_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);
```

### 5.13 tournament_stages

``` sql
create table public.tournament_stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  stage_type text not null check (stage_type in ('LEAGUE','KNOCKOUT')),
  sequence integer not null check (sequence > 0),
  qualification_count integer,
  status text not null default 'PENDING'
    check (status in ('PENDING','ACTIVE','COMPLETED')),
  created_at timestamptz not null default now(),
  unique (tournament_id, sequence)
);
```

### 5.14 volleyball_rules

``` sql
create table public.volleyball_rules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id uuid references public.tournament_stages(id) on delete cascade,
  sets_to_win integer not null check (sets_to_win > 0),
  win_by_two boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Use one tournament default rule (`stage_id is null`) and optional stage
overrides.

### 5.15 volleyball_set_rules

``` sql
create table public.volleyball_set_rules (
  id uuid primary key default gen_random_uuid(),
  volleyball_rule_id uuid not null references public.volleyball_rules(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  target_points integer not null check (target_points > 0),
  unique (volleyball_rule_id, set_number)
);
```

### 5.16 team_players

``` sql
create table public.team_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  acquisition_type text not null
    check (acquisition_type in ('REGISTERED','ICON_LOT','SETTER_LOT','AUCTION','MANUAL')),
  acquisition_amount numeric(12,2),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','RELEASED','DISQUALIFIED')),
  joined_at timestamptz not null default now()
);
```

Recommended invariant:

``` sql
create unique index team_players_one_active_team_per_tournament
on public.team_players (tournament_id, player_id)
where status = 'ACTIVE';
```

### 5.17 lot_sessions

``` sql
create table public.lot_sessions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  lot_type text not null check (lot_type in ('ICON','SETTER')),
  status text not null default 'PREPARING'
    check (status in ('PREPARING','SHUFFLED','LIVE','COMPLETED','CANCELLED')),
  shuffled_at timestamptz,
  locked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  cancelled_by uuid references public.profiles(id),
  cancellation_reason text,
  created_at timestamptz not null default now()
);
```

### 5.18 lot_entries

``` sql
create table public.lot_entries (
  id uuid primary key default gen_random_uuid(),
  lot_session_id uuid not null references public.lot_sessions(id) on delete cascade,
  lot_number integer not null check (lot_number > 0),
  player_id uuid not null references public.player_profiles(id),
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE','SELECTED')),
  selected_by_team_id uuid references public.teams(id),
  selected_at timestamptz,
  unique (lot_session_id, lot_number),
  unique (lot_session_id, player_id)
);
```

### 5.19 lot_turns

``` sql
create table public.lot_turns (
  id uuid primary key default gen_random_uuid(),
  lot_session_id uuid not null references public.lot_sessions(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  turn_order integer not null check (turn_order > 0),
  status text not null default 'WAITING'
    check (status in ('WAITING','ACTIVE','COMPLETED')),
  selected_entry_id uuid references public.lot_entries(id),
  started_at timestamptz,
  completed_at timestamptz,
  unique (lot_session_id, team_id),
  unique (lot_session_id, turn_order)
);
```

### 5.20 auctions

``` sql
create table public.auctions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  starting_purse numeric(12,2) not null check (starting_purse >= 0),
  minimum_bid_increment numeric(12,2) not null check (minimum_bid_increment > 0),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','READY','LIVE','PAUSED','COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id)
);
```

### 5.21 auction_team_wallets

``` sql
create table public.auction_team_wallets (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  starting_balance numeric(12,2) not null check (starting_balance >= 0),
  spent_amount numeric(12,2) not null default 0 check (spent_amount >= 0),
  remaining_balance numeric(12,2) not null check (remaining_balance >= 0),
  updated_at timestamptz not null default now(),
  unique (auction_id, team_id)
);
```

### 5.22 auction_players

``` sql
create table public.auction_players (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id),
  base_price numeric(12,2) not null check (base_price >= 0),
  auction_order integer,
  status text not null default 'WAITING'
    check (status in ('WAITING','LIVE','SOLD','UNSOLD','WITHDRAWN')),
  created_at timestamptz not null default now(),
  unique (auction_id, player_id)
);
```

Recommended: enforce at most one LIVE auction player per auction using a
partial unique index:

``` sql
create unique index one_live_player_per_auction
on public.auction_players (auction_id)
where status = 'LIVE';
```

### 5.23 auction_bids

``` sql
create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  auction_player_id uuid not null references public.auction_players(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  amount numeric(12,2) not null check (amount >= 0),
  source text not null check (source in ('TEAM_OWNER','ORGANIZER')),
  submitted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

Bids are inserted only through controlled RPC.

### 5.24 auction_sales

``` sql
create table public.auction_sales (
  id uuid primary key default gen_random_uuid(),
  auction_player_id uuid not null unique references public.auction_players(id),
  team_id uuid not null references public.teams(id),
  winning_bid_id uuid not null unique references public.auction_bids(id),
  sold_amount numeric(12,2) not null check (sold_amount >= 0),
  confirmed_by uuid not null references public.profiles(id),
  sold_at timestamptz not null default now()
);
```

### 5.25 purse_transactions

``` sql
create table public.purse_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.auction_team_wallets(id) on delete cascade,
  transaction_type text not null
    check (transaction_type in ('PURCHASE','REFUND','ADJUSTMENT')),
  amount numeric(12,2) not null,
  balance_before numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  player_id uuid references public.player_profiles(id),
  auction_sale_id uuid references public.auction_sales(id),
  reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
```

### 5.26 matches

``` sql
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id uuid references public.tournament_stages(id) on delete set null,
  match_number integer,
  home_team_id uuid not null references public.teams(id),
  away_team_id uuid not null references public.teams(id),
  scheduled_at timestamptz,
  venue text,
  court text,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','LIVE','COMPLETED','POSTPONED','CANCELLED')),
  winner_team_id uuid references public.teams(id),
  next_match_id uuid references public.matches(id),
  next_match_slot text check (next_match_slot in ('HOME','AWAY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
```

### 5.27 match_scorers

``` sql
create table public.match_scorers (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key (match_id, user_id)
);
```

### 5.28 match_sets

``` sql
create table public.match_sets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  set_number integer not null check (set_number > 0),
  target_points integer not null check (target_points > 0),
  home_score integer not null default 0 check (home_score >= 0),
  away_score integer not null default 0 check (away_score >= 0),
  winner_team_id uuid references public.teams(id),
  status text not null default 'PENDING'
    check (status in ('PENDING','LIVE','COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  unique (match_id, set_number)
);
```

### 5.29 score_events

``` sql
create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  match_set_id uuid not null references public.match_sets(id) on delete cascade,
  sequence_number bigint not null,
  event_type text not null check (event_type in ('POINT','UNDO','CORRECTION')),
  team_id uuid references public.teams(id),
  home_score_after integer not null check (home_score_after >= 0),
  away_score_after integer not null check (away_score_after >= 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (match_id, sequence_number)
);
```

### 5.30 standings_rules

``` sql
create table public.standings_rules (
  stage_id uuid primary key references public.tournament_stages(id) on delete cascade,
  win_points integer not null default 2,
  loss_points integer not null default 0,
  walkover_points integer,
  tie_break_rules jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
```

### 5.31 standings

``` sql
create table public.standings (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  stage_id uuid not null references public.tournament_stages(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  played integer not null default 0,
  won integer not null default 0,
  lost integer not null default 0,
  league_points integer not null default 0,
  sets_won integer not null default 0,
  sets_lost integer not null default 0,
  points_for integer not null default 0,
  points_against integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (stage_id, team_id)
);
```

Standings are a derived/cache table and must be rebuildable from
completed matches.

### 5.32 tournament_branding

``` sql
create table public.tournament_branding (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  primary_color text,
  secondary_color text,
  logo_path text,
  background_path text,
  font_preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

### 5.33 sponsors

``` sql
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  logo_path text,
  website text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
```

### 5.34 templates

``` sql
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  template_type text not null
    check (template_type in (
      'FIXTURE','TODAYS_MATCHES','TOMORROWS_MATCHES','RESULT',
      'POINTS_TABLE','PLAYER_OF_MATCH','ICON_SELECTION',
      'SETTER_SELECTION','SOLD','SQUAD','TOP_PERFORMERS',
      'SEMI_FINAL','FINAL','CHAMPION','RUNNER_UP'
    )),
  name text not null,
  layout_json jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### 5.35 notifications

``` sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  data_json jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
```

### 5.36 audit_logs

``` sql
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  reason text,
  created_at timestamptz not null default now()
);
```

Audit logs should normally be append-only.

## 6. Important Indexes

Add indexes at minimum for: - Every common FK filter. -
`tournaments(organization_id, status)`. -
`tournament_members(user_id, tournament_id)`. -
`teams(tournament_id, status)`. -
`player_tournament_registrations(tournament_id, status)`. -
`lot_sessions(tournament_id, lot_type, status)`. -
`lot_turns(lot_session_id, status)`. -
`auction_bids(auction_player_id, created_at desc)`. -
`auction_players(auction_id, status, auction_order)`. -
`matches(tournament_id, stage_id, status, scheduled_at)`. -
`score_events(match_id, sequence_number)`. -
`notifications(user_id, read_at, created_at desc)`. -
`audit_logs(tournament_id, created_at desc)`.

## 7. RLS Helper Functions

Create stable security-definer helpers carefully, with explicit
`search_path`, such as: - `is_organization_admin(org_id uuid)`. -
`is_tournament_organizer(tournament_id uuid)`. -
`is_team_owner(team_id uuid)`. - `is_assigned_scorer(match_id uuid)`. -
`is_tournament_member(tournament_id uuid)`.

Keep helpers small and test them.

## 8. RLS Policy Model

### profiles

-   User can read/update own private profile.
-   Organizer/public access to selected fields should use safe
    views/functions, not unrestricted private profile reads.

### organizations

-   Members can read.
-   OWNER/ADMIN can update.
-   Creation allowed to authenticated users according to product policy.

### tournaments

-   Organizers can manage their tournaments.
-   Active members can read relevant private tournament data.
-   Anonymous users can read only public tournaments through safe public
    access.

### teams

-   Organizer manages.
-   Team Owner updates permitted own editable fields only.
-   Public can read public-safe team fields.

### player_profiles

-   Player owns their linked profile.
-   Organizer can read relevant tournament applicants.
-   Public reads safe public projection only.

### registrations

-   Player can create/read/update own application while editable.
-   Organizer reviews.
-   Player cannot update approval/category fields.

### lot tables

-   Organizer full scoped access.
-   Team Owner gets safe lot state only.
-   Hidden mapping is never public.
-   Selection only through RPC.

### auction tables

-   Organizer scoped read/manage.
-   Team Owner can read tournament auction and own wallet.
-   Bid through RPC only.
-   Direct wallet/sale writes denied.
-   Public gets safe live projection.

### matches/scoring

-   Organizer manages.
-   Assigned Scorer can use scoring RPC.
-   Direct score mutation denied.
-   Public reads public match state.

### audit_logs

-   Organizer read.
-   Inserts from trusted functions/workflows.
-   No ordinary update/delete.

## 9. Safe Public Views / RPC Responses

Recommended public projections: - `public_tournament_view`. -
`public_team_view`. - `public_player_view`. - `public_fixture_view`. -
`public_standings_view`. - `public_live_auction_state`. -
`public_live_match_state`. - `public_revealed_lot_state`.

Never expose raw `lot_entries` anonymously.

## 10. Critical RPC Functions

### 10.1 approve_team_owner_application

Responsibilities: - Validate Organizer. - Lock application. - Validate
status. - Create team. - Link Team Owner. - Create tournament
membership. - Mark application approved. - Audit.

### 10.2 approve_player_registration

Responsibilities: - Validate Organizer. - Validate registration. - Set
approval/category. - Create/update tournament membership. - Audit
classification change.

### 10.3 shuffle_lot_session

Responsibilities: - Organizer-only. - Validate PREPARING state. -
Validate eligible players and lots. - Randomly map players to lot
numbers server-side. - Persist mapping. - Set SHUFFLED/locked
timestamps. - Audit.

Do not return hidden mapping to caller if product flow should keep even
Organizer UI blind after shuffle.

### 10.4 start_lot_session

-   Validate locked shuffle.
-   Set LIVE.
-   Activate first turn.

### 10.5 select_lot

Transaction: 1. Authenticate user. 2. Lock session. 3. Lock active turn.
4. Validate Team Owner/Organizer authority. 5. Lock selected lot row. 6.
Verify AVAILABLE. 7. Mark SELECTED. 8. Reveal selected player. 9. Insert
`team_players`. 10. Complete current turn. 11. Activate next turn. 12.
Audit. 13. Return revealed player payload.

### 10.6 cancel_lot_session

-   Organizer-only.
-   Require reason.
-   Prevent silent deletion.
-   Mark CANCELLED.
-   Audit.
-   Define whether already assigned players are rolled back or require
    separate explicit correction depending on session state.

### 10.7 place_auction_bid

Transaction: 1. Authenticate. 2. Lock auction/current auction player. 3.
Resolve user's team or Organizer-entered team. 4. Validate auction LIVE.
5. Validate active player. 6. Determine required next bid. 7. Lock
wallet. 8. Validate purse/squad. 9. Insert bid. 10. Return accepted
current state.

### 10.8 finalize_auction_sale

Transaction: 1. Organizer authorization. 2. Lock auction player. 3. Lock
latest accepted bid. 4. Lock wallet. 5. Verify player unsold. 6. Verify
purse/squad. 7. Create sale. 8. Create team player. 9. Create purse
ledger row. 10. Update wallet. 11. Mark player SOLD. 12. Audit. 13.
Return final sale.

### 10.9 mark_auction_player_unsold

-   Organizer-only.
-   Validate active player.
-   Mark UNSOLD.
-   Advance auction state safely.

### 10.10 award_point

Transaction: 1. Validate Organizer or assigned Scorer. 2. Lock match. 3.
Verify LIVE state. 4. Lock current set. 5. Validate team belongs to
match. 6. Compute next score. 7. Insert POINT event. 8. Update set
cache. 9. Evaluate set completion. 10. If set completed, create/activate
next set when required. 11. Evaluate match completion. 12. If match
completes, set winner and trigger standings/progression workflow. 13.
Return current authoritative scoreboard.

### 10.11 undo_last_score_event

-   Validate scorer/organizer.
-   Lock match/set.
-   Find last reversible event.
-   Record UNDO event.
-   Restore derived score.
-   Re-evaluate set/match state if allowed.
-   For completed matches, require Organizer correction workflow rather
    than normal Undo.

### 10.12 finalize/rebuild_standings

-   Read completed matches.
-   Apply configured points/tie-break inputs.
-   Upsert derived standings.
-   Must be safe to run repeatedly.

## 11. Realtime Design

### Lot

Subscribe to safe lot/session/turn/reveal state.

Events reflected: - Session status. - Shuffle complete. - Active team
turn. - Lot selected. - Revealed player. - Session completed.

### Auction

Subscribe to: - Current auction player. - Accepted bids. - Sale/unsold
state. - Public wallet summaries only if product chooses to show them.

### Match

Subscribe to: - Match state. - Current set cache. - Set completion. -
Match completion.

Spectators do not need raw internal score-event stream.

## 12. Next.js Route Architecture

``` text
app/
  (public)/
    page.tsx
    t/[slug]/
      page.tsx
      live/page.tsx
      fixtures/page.tsx
      results/page.tsx
      table/page.tsx
      bracket/page.tsx
      teams/page.tsx
      teams/[teamId]/page.tsx
      players/page.tsx
      players/[playerId]/page.tsx

  (auth)/
    login/page.tsx
    register/page.tsx
    forgot-password/page.tsx

  (organizer)/
    organizer/
      page.tsx
      tournaments/page.tsx
      tournaments/[id]/
        page.tsx
        setup/page.tsx
        registrations/page.tsx
        team-owners/page.tsx
        teams/page.tsx
        players/page.tsx
        lot/page.tsx
        lot/icon/page.tsx
        lot/setter/page.tsx
        auction/page.tsx
        auction/history/page.tsx
        fixtures/page.tsx
        matches/page.tsx
        standings/page.tsx
        templates/page.tsx
        sponsors/page.tsx
        settings/page.tsx
        audit/page.tsx

  (owner)/
    owner/
      page.tsx
      tournaments/[id]/
        page.tsx
        team/page.tsx
        squad/page.tsx
        lot/page.tsx
        auction/page.tsx
        purse/page.tsx
        fixtures/page.tsx
        results/page.tsx

  (player)/
    player/
      page.tsx
      profile/page.tsx
      tournaments/page.tsx
      tournaments/[id]/page.tsx
      history/page.tsx

  (scorer)/
    scorer/
      page.tsx
      matches/page.tsx
      matches/[matchId]/page.tsx
```

Route groups are illustrative; actual layouts may be adjusted.

## 13. API Client Separation

Maintain separate helpers for: - Browser client. - Server client. -
Middleware/session refresh where required.

Never expose service-role credentials to browser bundles.

## 14. Frontend State

Prefer server/database state over a large global client store.

Use local/client state for: - Form state. - Modal/sheet state. -
Animation state. - Optimistic non-critical UX.

For critical competitive actions, avoid optimistic final state. Show
pending, wait for RPC success, then reconcile realtime/refetch.

## 15. PWA Architecture

Include from Phase 1: - Web manifest. - Icons. - Standalone mode. -
Install support. - Service worker/update lifecycle. - Safe static
caching.

Live/competitive requests should use network-first/no-stale-authority
behavior.

On update: - Notify user when a new version is ready. - Avoid forced
reload in the middle of an active scoring/auction action. - Apply update
at a safe point.

## 16. Storage Architecture

Object paths should include stable scope identifiers.

Examples:

``` text
avatars/{userId}/avatar.webp
player-photos/{playerId}/profile.webp
team-logos/{tournamentId}/{teamId}/logo.webp
tournament-assets/{tournamentId}/logo.webp
sponsor-assets/{tournamentId}/{sponsorId}/logo.webp
template-assets/{tournamentId}/{templateId}/...
generated-media/{tournamentId}/{type}/{id}.webp
```

## 17. Connection Recovery

For live screens: 1. Detect disconnect. 2. Show Reconnecting. 3. Disable
unsafe mutation buttons if server confirmation is unavailable. 4. On
reconnect, refetch authoritative state. 5. Re-establish subscriptions.
6. Re-enable actions only after state is reconciled.

## 18. Concurrency Strategy

### Lot

Use row locks in `select_lot`. Only one transaction can successfully
claim an AVAILABLE lot.

### Auction

Lock active auction player and relevant wallet during bid/finalization.
Do not derive winner from client timestamps.

### Scoring

Lock current match/set while applying score event. Use unique sequence
numbers per match. Consider request idempotency tokens for point actions
to prevent network retries from double-scoring.

## 19. Audit Strategy

Critical RPCs write audit entries in the same transaction where
practical.

Audit is append-only from normal application roles.

## 20. Suggested Migration Order

1.  Extensions/helpers.
2.  Profiles.
3.  Organizations/members.
4.  Tournaments/settings.
5.  Teams/owner registration/memberships.
6.  Player profiles/registrations.
7.  Stages/volleyball rules.
8.  Team players.
9.  Lot tables.
10. Auction/wallet/bid/sale/ledger.
11. Matches/scorers/sets/score events.
12. Standings.
13. Branding/sponsors/templates.
14. Notifications/audit.
15. Indexes.
16. RLS helpers.
17. RLS policies.
18. Public views.
19. RPC functions.
20. Realtime publication configuration where required.

## 21. Testing Architecture

### Unit

-   Scoring rule evaluation.
-   Fixture generation.
-   Tie-break calculations.
-   UI utilities.

### Database Integration

-   RLS.
-   Lot selection.
-   Concurrent lot claim.
-   Auction bidding.
-   Concurrent bids.
-   SOLD transaction.
-   Purse ledger.
-   Scoring.
-   Duplicate point retry.
-   Match finalization.
-   Standings rebuild.

### End-to-End

-   Organizer creates tournament.
-   Owner registers.
-   Player registers.
-   Organizer approves/classifies.
-   Icon lot.
-   Setter lot.
-   Auction.
-   Squad complete.
-   Fixtures.
-   Scorer runs match.
-   Standings update.
-   Public viewer sees live/result.
-   Final/champion.

## 22. Performance Considerations

-   Paginate large player/registration lists.
-   Index tournament-scoped queries.
-   Do not subscribe to whole tables globally.
-   Use optimized images for player/team assets.
-   Cache public non-live pages appropriately.
-   Keep `/live` fresh and realtime.
-   Avoid expensive standings computation on every public render;
    maintain derived standings and support rebuild.

## 23. Future-Sport Extension Boundary

V1 UI exposes only Volleyball.

Reusable: - Organizations. - Users/memberships. - Tournament base. -
Teams. - Registration framework. - Fixtures/matches base. - Public
pages. - Branding/templates. - Notifications/audit.

Volleyball-specific: - Positions. - `volleyball_rules`. -
`volleyball_set_rules`. - Set scoring engine. - Volleyball standings
metrics/rules.

Future sports should add sport-specific rule/stat modules rather than
polluting Volleyball tables.
