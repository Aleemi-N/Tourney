# Volleyball Tournament Platform V1 --- Product Requirements Document

## 1. Document Status

-   Product scope: Volleyball only for V1
-   Delivery surface: Responsive web application + PWA
-   Primary users: Organizers, Team Owners, Players, Scorers, Spectators
-   Frontend: Next.js + TypeScript + Tailwind CSS + Framer Motion
-   Backend platform: the Tourny API (Spring Boot) on PostgreSQL
-   Database: PostgreSQL
-   Authentication: the API's own accounts and JWTs
-   Realtime: the API's websocket
-   Storage: the API's image storage
-   Security: PostgreSQL Row Level Security (RLS)
-   Critical mutations: PostgreSQL functions/RPC transactions

## 2. Product Vision

Build a mobile-first volleyball tournament operating platform that can
replace fragmented paper, spreadsheet, WhatsApp, manual auction, manual
lot draw, manual scoring, and poster workflows.

The platform must support: - Knockout tournaments. - League tournaments
with already-registered teams. - Auction leagues where players register
individually. - Separate digital Icon Player Lot and Setter Lot. - Live
player auction. - Team Owner accounts. - Reusable Player accounts. -
Dedicated Scorer accounts. - Public spectator/live view. - Digital
volleyball scoring and scoreboard. - Automatic fixtures, results,
standings, brackets, and media templates.

V1 is volleyball-only. The underlying tournament model should avoid
unnecessary assumptions that prevent adding other sports later.

## 3. Product Principles

1.  Mobile-first: every core operational flow must work on a normal
    smartphone.
2.  No special venue hardware required: projector/TV/LED is optional.
3.  Public live access: spectators can follow from their own phones
    without an account.
4.  Server-authoritative: lots, bids, purse balances, team assignments,
    scoring, and results must never trust client state as the source of
    truth.
5.  Recoverable: unstable venue internet must not silently corrupt
    competitive state.
6.  Auditable: sensitive changes require an audit trail.
7.  Simple by default: organizers should be guided through setup instead
    of facing a large ERP-like settings page.
8.  Reusable identities: players create a profile once and join future
    tournaments from the same account.

## 4. User Roles

### 4.1 Organizer

Can: - Create and configure tournaments. - Manage tournament branding
and sponsors. - Configure registration. - Review Team Owner
applications. - Review and classify Player applications. - Create or
manually add teams, owners, and players. - Configure volleyball scoring
rules. - Configure stages. - Prepare, shuffle, run, cancel, and audit
Icon/Setter lot sessions. - Run live auctions and enter offline bids
when required. - Manage fixtures and results. - Assign Scorers. -
Correct results through controlled audited actions. - Manage standings
and playoff progression. - Generate media templates. - View reports and
audit history.

### 4.2 Team Owner

Can: - Register/apply for a team when registration mode permits. -
Manage own team identity. - View own squad. - Participate in own
Icon/Setter lot turn. - Participate in live auction for own team. - View
own purse and transaction history. - View fixtures/results. - Receive
tournament notifications.

A Team Owner must never be able to mutate another team's data.

### 4.3 Player

Can: - Maintain reusable player profile. - Join open tournaments. -
Submit tournament registration. - Track approval/category/selection
status. - See assigned team, fixtures, results, and personal tournament
history.

A Player cannot classify themselves as Icon Player or force approval.

### 4.4 Scorer

Can: - View assigned matches. - Start an assigned match when
permitted. - Add points. - Undo/correct scoring according to
permission. - Finish scoring through the automatic match engine.

A Scorer has no auction, purse, team administration, or tournament
configuration access.

### 4.5 Spectator

No account required. Can view only published/public data: - Live
lot/reveal. - Live auction. - Live score. - Fixtures. - Results. -
Standings. - Bracket. - Teams/squads. - Public player
profiles/statistics. - Sponsors.

## 5. Tournament Types

### 5.1 Knockout

Workflow: Create Tournament -\> Team Registration -\> Squad Verification
-\> Draw/Bracket -\> Fixtures -\> Matches -\> Automatic Winner
Progression -\> Final -\> Champion

### 5.2 League --- Registered Teams

Workflow: Create Tournament -\> Team Owner/Team Registration -\> Squad
Registration -\> Verification -\> Fixtures -\> League Matches -\>
Standings -\> Optional Playoffs/Semifinal -\> Final -\> Champion

### 5.3 League --- Auction

Workflow: Create Tournament -\> Team Owner Registration -\> Player
Registration -\> Player Approval/Classification -\> Icon Player Lot -\>
Setter Lot -\> Main Live Auction -\> Unsold/Re-auction -\> Final Squads
-\> Fixtures -\> League -\> Playoffs -\> Final -\> Champion

## 6. Tournament Setup Wizard

The Organizer should create a tournament through a guided wizard:

1.  Basic Information
2.  Tournament Format
3.  Registration Settings
4.  Team Settings
5.  Volleyball Scoring Rules
6.  Stages/Qualification
7.  Lot Rules (Auction League only)
8.  Auction Rules (Auction League only)
9.  Branding/Sponsors
10. Review & Publish

Basic information: - Tournament name. - Slug. - Logo. - Description. -
Venue. - Start/end dates. - Registration start/end. - Public/private
status.

## 7. Team Owner Registration

Modes: - Open Registration. - Invite Only. - Organizer Added.

Application fields: - Team name. - Short name. - Team logo. - Place. -
Owner name/account. - Phone. - Email optional. - Team colors optional. -
Co-owner/manager optional.

Organizer actions: - Approve. - Reject. - Request changes. - Manually
create. - Replace/transfer primary owner. - Disable owner access.

For Auction League, approval creates the team and makes it eligible for
lot/auction setup.

## 8. Player Registration

### 8.1 Reusable Player Profile

Fields: - Photo. - Full/display name. - Date of birth. - Phone. -
Place/club. - Height optional. - Primary position. - Secondary position
optional. - Playing history optional.

Volleyball positions: - Setter. - Libero. - Middle Blocker. - Outside
Hitter. - Opposite. - Universal.

### 8.2 Auction League Registration

Organizer publishes registration link + QR.

Flow: Player opens link -\> Login/Create Account -\> Join Tournament -\>
Confirm/update profile -\> Submit -\> Pending -\> Organizer review -\>
Approved/Rejected/Changes Requested -\> Organizer classification

Organizer classifications: - Icon Lot. - Setter Lot. - Main Auction.

The player cannot select Icon status.

### 8.3 Registered-Team League

Team Owner can add squad members. Existing player accounts may be
linked; non-account players can be manually created/linked later.

## 9. Icon Player Lot

### 9.1 Rules

-   Separate from Setter Lot.
-   No bidding.
-   Eligible Icon players are prepared by Organizer.
-   Each team receives one selection according to configured turn order.
-   Hidden player-to-lot mapping must be unavailable to Team Owners and
    Public viewers before reveal.

### 9.2 Flow

Prepare Players -\> Verify Team Count -\> Set Turn Order -\> Shuffle -\>
Lock -\> Start Session -\> Activate Team Turn -\> Team Owner Picks
Hidden Lot -\> Reveal Animation -\> Assign Player -\> Next Team -\>
Complete

### 9.3 Shuffle Screen

-   Full-screen animation.
-   Countdown: 3, 2, 1.
-   Player cards mix/flip/shuffle.
-   Cards resolve to hidden numbered lots.
-   Session shows "Shuffle Complete --- Locked".

Once locked, silent reshuffle is prohibited.

### 9.4 Reveal

-   Selected lot moves to center.
-   Other lots fade.
-   Optional suspense countdown.
-   Card flip.
-   Player photo/name/position reveal.
-   Team identity appears.
-   Assignment is committed server-side.
-   Optional confetti/sound.

## 10. Setter Lot

Uses the same lot engine but is a completely separate session and player
pool.

Flow: Setter Pool -\> Shuffle -\> Lock -\> Team Turns -\> Hidden Lot
Pick -\> Setter Reveal -\> Assignment -\> Complete

Never combine Icon and Setter into the same lot in V1.

## 11. Main Live Auction

### 11.1 Configuration

Organizer configures: - Starting purse. - Minimum bid increment. -
Player base prices. - Squad minimum/maximum. - Auction order. - Optional
category/position restrictions.

### 11.2 Live Player Card

Show: - Player photo. - Name. - Position. - Base price. - Current bid. -
Highest bidding team. - Auction status.

### 11.3 Auctioneer Controlled Bidding

All bidding is performed offline (in-person). Team Owners raise paddles or shout their bids.
The Organizer (Auctioneer) uses the digital interface to input the highest current bid on behalf of the bidding team.
The Team Owner portal does *not* contain digital bidding buttons; they only have a read-only live view of the auction and their remaining purse.

Before acceptance of a manual bid, server validates:
- Organizer has admin rights.
- Auction is LIVE.
- Correct active player.
- Bid amount is valid (meets minimum increments).
- Team has sufficient purse.
- Team is within squad constraints.

### 11.4 Organizer Control

Organizer can: - Start/pause/resume. - Select next player. - Enter a
bid on behalf of a team. - Mark SOLD. - Mark UNSOLD. -
Run re-auction/accelerated rounds. - Correct exceptional issues with an
audit reason.

### 11.5 SOLD

Finalization must atomically: - Verify current winning bid. - Verify
player availability. - Verify purse. - Verify squad rules. - Create
sale. - Assign player. - Deduct purse. - Create purse transaction. -
Mark auction player SOLD.

### 11.6 Unsold

Unsold players enter an Unsold Pool and may be re-auctioned later.

## 12. Team Squad

Each tournament squad member stores acquisition type: - REGISTERED. -
ICON_LOT. - SETTER_LOT. - AUCTION. - MANUAL.

For auction acquisitions, sold amount is retained.

## 13. Volleyball Scoring Rules

Organizer controls match scoring rules.

Presets: - Best of 3: normally 25 / 25 / 15, 2 sets to win. - Best of 5:
normally 25 / 25 / 25 / 25 / 15, 3 sets to win.

Custom: - Number of sets. - Sets required to win. - Target score per
set. - Win by 2 ON/OFF.

Rules can be: - Same for whole tournament, or - Different by stage.

Example: League: BO3 25/25/15 Semifinal: BO3 25/25/15 Final: BO5
25/25/25/25/15

## 14. Tournament Stages

Support: - League. - Quarterfinal. - Semifinal. - Final. - Custom named
stage where appropriate.

A league may qualify top N teams into a knockout stage.

## 15. Fixtures

### 15.1 League

-   Automatic round-robin generation.
-   Manual fixture creation.
-   Date/time.
-   Venue.
-   Court.
-   Round.
-   Rescheduling.
-   Conflict detection.

### 15.2 Knockout

-   Manual or generated bracket.
-   Winner automatically progresses to configured next match slot.
-   Organizer correction is possible only through controlled audited
    action.

## 16. Digital Scoring

### 16.1 Purpose

Replace paper score writing/crossing with a simple digital scoring
workflow.

### 16.2 Scorer UI

Large touch targets: - Home Team +1. - Away Team +1. - Undo. - Current
set. - Sets won. - Previous set scores. - Match state.

### 16.3 Score Events

Every accepted score change is stored as an event rather than only
overwriting a number.

Examples: - POINT. - UNDO. - CORRECTION.

### 16.4 Automatic Set Logic

For each point: - Read current set rule. - Check target. - Check Win by
2 if enabled. - Complete set when valid. - Start next set. - Check
sets-to-win. - Complete match automatically.

### 16.5 Match Completion

On match completion: - Winner is saved. - League standings are
updated/rebuilt. - Knockout progression occurs if applicable. - Public
result updates. - Result template data becomes available.

## 17. Live Scoreboard

A dedicated presentation/read-only screen displays: - Team
names/logos. - Current points. - Current set. - Sets won. - Previous set
scores. - Live state.

It must work on: - Mobile. - Tablet. - Laptop. - TV/projector/LED
browser.

## 18. Public Live/Spectator Mode

Every public tournament receives a shareable web URL and QR.

Primary public navigation: - Live. - Fixtures. - Results. - Table. -
Teams. - Players. - Bracket.

Live content changes according to active event: - Icon Lot. - Setter
Lot. - Auction. - Match score.

No login required for public data.

## 19. Standings

Track: - Played. - Won. - Lost. - League points. - Sets won. - Sets
lost. - Points for. - Points against. - Derived set/point ratios when
required.

Organizer can configure points/tie-break rules. Standings must be
rebuildable from completed match data.

## 20. Template & Media Generator

Tournament branding is configured once: - Logo. - Primary/secondary
colors. - Background/theme. - Sponsors.

Template types: - Fixture. - Today's Matches. - Tomorrow's Matches. -
Result. - Points Table. - Player of the Match. - Icon Selection. -
Setter Selection. - Auction SOLD. - Team Squad. - Top Performers. -
Semifinal. - Final. - Champion. - Runner-up.

Output presets: - 1080x1080 post. - 1080x1920 story. -
Landscape/presentation.

Mobile editor: controlled/simple. Tablet/desktop: richer editor.

## 21. Notifications

V1 in-app notifications: - Registration approved/rejected/changes
requested. - Lot starting. - Team's lot turn. - Auction starting. -
Player selected/sold. - Fixture created/changed. - Match reminder. -
Result published.

External WhatsApp/SMS integrations are future scope.

## 22. Responsive UX

### Mobile 320--767

-   Bottom navigation.
-   Single-column cards.
-   No squeezed desktop tables.
-   Full-screen lot/auction/scoring experiences.

### Tablet 768--1023

-   Collapsible sidebar.
-   1--2 column content.
-   Larger lot grids and management views.

### Laptop/Desktop 1024+

-   Full sidebar/top bar.
-   Multi-column dashboards.
-   Table views where appropriate.

### Presentation Mode

-   No admin navigation.
-   No controls.
-   Read-only cinematic lot/reveal/auction/scoreboard.

## 23. PWA Requirements

-   Installable manifest.
-   Standalone display.
-   192x192 icon.
-   512x512 icon.
-   Maskable icon.
-   Apple touch icon.
-   Favicon.
-   Theme/background colors.
-   Update handling.
-   Install UX where supported.
-   App shell/static asset caching.

Never treat cached live competitive state as authoritative.

If connection is unavailable during lot, auction, or scoring: - Show
Offline/Reconnecting. - Disable unsafe critical actions. - Refetch
authoritative state on reconnect. - Re-subscribe to realtime. - Do not
blindly replay stale bids or lot picks.

## 24. Non-Functional Requirements

-   Responsive from 320px to large displays.
-   Secure RLS on all private/mutable data.
-   No hidden lot leakage.
-   Transactional auction finalization.
-   Idempotent critical RPCs where practical.
-   Realtime updates should recover after reconnect.
-   Public pages should be fast and shareable.
-   Audit trail for sensitive actions.
-   Storage policies must prevent unauthorized uploads/replacements.
-   Accessibility: keyboard support where practical, adequate touch
    targets, labels, contrast, reduced-motion consideration.

## 25. V1 Out of Scope

-   Native Android/iOS app.
-   Expo/React Native.
-   Other sports.
-   AI features.
-   Fantasy league.
-   Advanced livestream integration.
-   Complex online payment settlement.
-   Full rally analytics beyond score-event history.
-   WhatsApp/SMS automation.
-   Advanced multi-language support unless separately added.

## 26. Acceptance Scenarios

V1 is not complete until a full simulated tournament can run from
registration to champion.

Critical scenarios: - Two teams attempt the same lot selection. - Two
teams bid nearly simultaneously. - Duplicate bid request. - Team reaches
purse limit exactly. - Team reaches max squad. - Player cannot be sold
twice. - Organizer pauses/resumes auction. - Internet drops during
auction and reconnects. - Scorer double-taps +1. - Undo after a point. -
Extended set such as 31--29. - Stage-specific scoring rule. - Wrong
result correction with audit reason. - Lot session cancellation and
restart. - Public viewer reconnects. - 320, 375, 390, 768, 1024, 1440,
and 1920px layout checks.

## 27. Delivery Phases

1.  Foundation: Next.js, the API, migrations, auth, roles, responsive
    shell, PWA.
2.  Tournament setup + organization model.
3.  Team Owner registration.
4.  Player profile/registration/approval.
5.  Volleyball rules + stages.
6.  Icon/Setter lot engine.
7.  Auction engine.
8.  Fixtures/bracket.
9.  Scorer + digital scoring + scoreboard.
10. Standings.
11. Public live pages.
12. Templates/media.
13. Notifications/reports/audit.
14. Full security, concurrency, responsive, and end-to-end QA.
