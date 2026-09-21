# Volleyball Tournament Platform V1 --- Design System & UX Specification

## 1. Purpose

This document defines the visual system, responsive behavior,
navigation, component patterns, and screen-level UX for the Volleyball
Tournament Platform V1.

The product is a responsive Next.js PWA. It must feel like a modern
sports operations product rather than a generic ERP. Organizer workflows
may be information-dense, while Team Owner, Player, Scorer, Public Live,
Auction, and Lot experiences should remain focused and visually clear.

## 2. Design Principles

### 2.1 Sports-first

The visual language should feel energetic, competitive, modern, and
suitable for a live volleyball tournament.

### 2.2 Mobile-first

Every important action must work comfortably from a normal phone.
Desktop is an enhancement, not the baseline.

### 2.3 Operational clarity

Critical information such as: - current score, - active team, - current
bid, - remaining purse, - lot turn, - SOLD status, - match status

must be immediately understandable.

### 2.4 Focus during live operations

Lot, auction, and scoring screens should remove unnecessary UI and keep
the active operation dominant.

### 2.5 Consistent but role-specific

Organizer, Team Owner, Player, Scorer, and Spectator experiences share
the same brand system, but they should not look like the same dashboard
with different menu items hidden.

### 2.6 Motion with purpose

Framer Motion should be used for: - lot shuffle, - lot reveal, - auction
state changes, - score feedback, - navigation transitions, -
sheets/dialogs, - success states.

Motion must never delay an operational action or hide authoritative
state.

Respect reduced-motion preferences.

------------------------------------------------------------------------

# 3. Visual Direction

Use a clean modern sports-SaaS visual direction.

Characteristics: - Strong typography. - Large numeric values for live
states. - Rounded but not overly soft cards. - Clear hierarchy. - High
contrast. - Spacious public/live screens. - Denser Organizer screens. -
Strong team/player imagery. - Minimal decorative gradients. - Avoid
excessive glassmorphism. - Avoid a generic banking/ERP appearance.

The tournament's own branding can influence public pages and generated
templates without breaking application usability.

------------------------------------------------------------------------

# 4. Color Architecture

Do not hard-code one tournament's colors throughout the product.

Use two layers:

## 4.1 Application UI Tokens

Semantic tokens:

``` text
background
surface
surface-raised
surface-muted

text-primary
text-secondary
text-muted
text-inverse

border
border-strong

primary
primary-hover
primary-foreground

success
warning
danger
info

live
sold
unsold
offline
```

## 4.2 Tournament Brand Tokens

Per tournament:

``` text
tournament-primary
tournament-secondary
tournament-accent
tournament-background
```

Tournament colors can appear in: - public tournament header, -
team/tournament cards, - live presentation, - generated posters, -
subtle accents.

Never allow a tournament color to destroy accessibility of operational
controls.

------------------------------------------------------------------------

# 5. Dark Mode

V1 should be architected to support dark mode cleanly.

Live/presentation experiences may naturally use a darker cinematic
surface even when the management UI is light.

Do not make critical state dependent only on color.

Example: - SOLD = color + SOLD label. - LIVE = color + LIVE badge. -
Offline = color + icon + text.

------------------------------------------------------------------------

# 6. Typography

Use a clean modern sans-serif optimized for UI and numbers.

Typography roles:

``` text
Display
Page Title
Section Title
Card Title
Body
Small Body
Label
Caption
Numeric Display
```

Guidelines: - Live score numbers should be extremely legible. - Auction
amount should use tabular/numeric-friendly rendering. - Player names
should not be forced into tiny text. - Avoid uppercase for long
paragraphs. - Uppercase is acceptable for compact state labels such as
LIVE, SOLD, UNSOLD.

------------------------------------------------------------------------

# 7. Spacing

Use a consistent spacing scale based around a 4px system.

Suggested:

``` text
4
8
12
16
20
24
32
40
48
64
```

Mobile page horizontal padding: - 16px default. - 12px only for
intentionally dense operational screens.

Tablet: - 20--24px.

Desktop: - 24--32px.

------------------------------------------------------------------------

# 8. Radius & Elevation

Suggested radius hierarchy:

``` text
Small controls: 8–10px
Inputs/buttons: 10–12px
Cards: 14–16px
Large panels/dialogs: 18–24px
Pills: fully rounded
```

Use shadows sparingly.

Hierarchy should primarily come from: - spacing, - surface contrast, -
borders, - typography.

------------------------------------------------------------------------

# 9. Breakpoints

Design and test explicitly at:

``` text
320
375
390
768
1024
1440
1920
```

Behavior groups:

## Small Mobile --- 320--374

-   Single column.
-   Bottom navigation.
-   Compact header.
-   Full-width primary actions.
-   2-column lot grid when feasible.

## Mobile --- 375--767

-   Single-column cards.
-   Bottom navigation.
-   Bottom sheets.
-   Large touch controls.

## Tablet --- 768--1023

-   Collapsible sidebar or rail.
-   1--2 column layouts.
-   Larger management tables/cards.
-   3--4 column lot grid.

## Laptop --- 1024--1439

-   Persistent sidebar.
-   Main content + contextual side panel where useful.
-   Tables for dense data.

## Desktop --- 1440+

-   Wide operational dashboard.
-   Multi-column layouts.
-   Larger public/presentation visuals.

------------------------------------------------------------------------

# 10. Global Application Shell

## 10.1 Organizer Desktop

Structure:

``` text
+----------------+------------------------------------+
| Sidebar        | Top Bar                            |
|                +------------------------------------+
| Dashboard      |                                    |
| Tournaments    | Main Content                       |
| Registrations  |                                    |
| Teams          |                                    |
| Players        |                                    |
| Live           |                                    |
| Templates      |                                    |
| Reports        |                                    |
| Settings       |                                    |
+----------------+------------------------------------+
```

Sidebar should be grouped rather than showing every sub-page
permanently.

Recommended groups: - Overview - Tournament - Participants -
Competition - Live Operations - Media - Administration

## 10.2 Organizer Mobile

Bottom navigation:

``` text
Home
Tournament
Live
Templates
More
```

`More` opens a sheet containing: - Teams. - Players. - Registrations. -
Fixtures. - Standings. - Sponsors. - Reports. - Settings. - Audit.

Do not place 10+ icons in mobile bottom navigation.

------------------------------------------------------------------------

# 11. Team Owner Navigation

## Mobile

Suggested bottom navigation:

``` text
Home
Squad
Live
Matches
More
```

`Live` routes contextually to Lot or Auction when one is active.

More: - Team. - Purse. - Transactions. - Results. - Notifications.

## Desktop

Compact sidebar: - Overview. - Team. - Squad. - Lot. - Auction. -
Purse. - Fixtures. - Results.

------------------------------------------------------------------------

# 12. Player Navigation

Mobile:

``` text
Home
Tournaments
Profile
History
```

The Player experience should be significantly simpler than Organizer.

Primary home content: - Current tournament status. - Current team. -
Next match. - Recent result. - Notifications.

------------------------------------------------------------------------

# 13. Scorer Navigation

Do not create a complex dashboard.

Scorer home:

``` text
Assigned Matches
Live Now
Completed
```

When a match is opened, transition into a focused scoring screen.

------------------------------------------------------------------------

# 14. Public Navigation

Tournament public page:

``` text
LIVE
FIXTURES
RESULTS
TABLE
TEAMS
PLAYERS
```

Bracket can be a secondary item when applicable.

On mobile: - Horizontally scrollable tab navigation or compact menu. -
LIVE should remain prominent while an event is active.

Public pages should not expose organizer-style navigation.

------------------------------------------------------------------------

# 15. Core Components

Build reusable components for:

``` text
AppShell
Sidebar
BottomNav
TopBar
PageHeader
SectionHeader

Button
IconButton
FloatingActionButton
SegmentedControl

Input
Textarea
Select
Combobox
DatePicker
TimePicker
Checkbox
Switch

Card
StatCard
PlayerCard
TeamCard
MatchCard
FixtureCard
ResultCard

StatusBadge
RoleBadge
LiveBadge

Tabs
DataTable
MobileDataCard
Pagination
SearchInput
FilterSheet

Dialog
BottomSheet
Drawer
Popover
Tooltip

EmptyState
LoadingState
Skeleton
ErrorState
OfflineBanner
ReconnectBanner

Avatar
PlayerAvatar
TeamLogo

Toast
InlineAlert
ConfirmationDialog
```

------------------------------------------------------------------------

# 16. Status System

Use consistent states.

## Tournament

``` text
Draft
Registration Open
Preparation
Live
Completed
Archived
```

## Registration

``` text
Pending
Approved
Changes Requested
Rejected
Withdrawn
```

## Match

``` text
Scheduled
Live
Completed
Postponed
Cancelled
```

## Auction

``` text
Waiting
Live
Sold
Unsold
Withdrawn
```

## Lot

``` text
Preparing
Shuffled
Live
Completed
Cancelled
```

Every status should have: - text label, - semantic visual style, -
optional icon.

------------------------------------------------------------------------

# 17. Organizer Dashboard

Purpose: answer "What needs my attention now?"

Recommended layout:

### Header

-   Tournament selector.
-   Tournament status.
-   Quick actions.

### Priority Strip

Examples: - 12 pending player approvals. - Icon Lot ready. - 2 fixtures
need scorer assignment. - Match live now.

### KPI Cards

-   Teams.
-   Registered Players.
-   Approved Players.
-   Matches.
-   Completed Matches.

### Live Operations

If something is live: - Current auction. - Current lot. - Current match.

### Upcoming

-   Next fixtures.
-   Registration deadline.
-   Tournament start.

### Activity

Recent: - approvals, - lot selections, - auction sales, - results.

Avoid filling the dashboard with charts simply because space exists.

------------------------------------------------------------------------

# 18. Tournament Setup Wizard Design

Use a stepper.

Desktop: - Vertical stepper left. - Form content center/right.

Mobile: - Compact progress indicator. - One step per screen. - Sticky
bottom actions.

Actions:

``` text
Back
Save Draft
Continue
```

Final step: - Review sections. - Validation warnings. - Publish/Open
Registration.

Never lose previously entered data when moving between steps.

------------------------------------------------------------------------

# 19. Registration Management

Desktop: - Search/filter toolbar. - Table. - Side panel/drawer for
review.

Mobile: - Filter button. - Applicant cards. - Tap card -\> full-screen
sheet/detail.

Player review should show: - photo, - identity, - position, - profile
details, - previous history if available, - requested/registration data.

Organizer actions:

``` text
Approve
Request Changes
Reject
```

After approval for Auction League:

``` text
Assign Category:
Icon Lot
Setter Lot
Main Auction
```

Classification should be visually separate from Player's self-entered
position.

------------------------------------------------------------------------

# 20. Team Owner Registration Screen

Public registration page: - Tournament identity. - Registration
deadline. - Available team slots if organizer chooses to expose them. -
Clear application form. - Login/create-account gate where needed.

After submission: - Large status card. - Pending/Approved/Changes
Requested/Rejected. - Organizer message when relevant.

------------------------------------------------------------------------

# 21. Player Registration Screen

Mobile-first.

Header: - Tournament logo/name. - Registration status/deadline.

If existing profile: - Show reusable player card. - "Use this
profile". - Edit allowed fields.

If new: - Guided profile form.

Submission success: - Registration number if generated. - Pending review
status. - Clear explanation that organizer determines auction category.

------------------------------------------------------------------------

# 22. Team Owner Dashboard

Auction League home should show:

### Team Identity

-   Logo.
-   Name.
-   Owner.

### Status Cards

``` text
Team Approved
Players: 0 / Max
Icon: Pending
Setter: Pending
Auction: Not Started
```

### Purse

Large remaining purse card.

### Live Action

If team's lot turn: - "YOUR TURN --- PICK A LOT"

If auction active: - current player, - current bid, - quick entry into
Auction Room.

### Squad Preview

Recent/selected players.

### Upcoming Match

Next fixture after schedule exists.

------------------------------------------------------------------------

# 23. Player Dashboard

Primary card: - Current tournament. - Registration status.

Possible status timeline:

``` text
Registered
   ↓
Approved
   ↓
Category Assigned
   ↓
Lot/Auction
   ↓
Selected / Sold
   ↓
Team Assigned
```

After team assignment: - Team card. - Next fixture. - Tournament
statistics when available.

------------------------------------------------------------------------

# 24. Lot Preparation Screen --- Organizer

Sections: 1. Session type: Icon or Setter. 2. Eligible players. 3.
Participating teams. 4. Pick order. 5. Validation. 6. Start Shuffle.

Show validation such as: - 8 teams. - 8 eligible players. - All teams
have a turn. - Session ready.

If counts/rules are invalid, explain exactly what must be fixed.

------------------------------------------------------------------------

# 25. Shuffle Experience

This is a special full-screen route/mode.

## Before Shuffle

Center: - Tournament logo. - "ICON PLAYER LOT" or "SETTER LOT". - Player
count. - Team count.

Organizer control: - Start Shuffle.

## Countdown

Large:

``` text
3
2
1
```

## Shuffle

Player cards: - move, - overlap, - flip, - mix.

Do not make animation excessively long.

Suggested total: - approximately 3--5 seconds.

## Completion

Cards become:

``` text
LOT 01
LOT 02
LOT 03
...
```

Display:

``` text
SHUFFLE COMPLETE
Mapping Locked
```

Then: - Start Selection.

Reduced-motion mode: - simple fade/crossfade rather than aggressive
movement.

------------------------------------------------------------------------

# 26. Lot Selection --- Team Owner

Mobile layout:

``` text
ICON PLAYER LOT

YOUR TURN
Team Falcons

[ LOT 01 ] [ LOT 02 ]
[ LOT 03 ] [ LOT 04 ]
[ LOT 05 ] [ LOT 06 ]

Choose one hidden lot

Remaining time/status if used
```

Unavailable lots: - remain visible, - clearly marked selected, - not
tappable.

On tap: - confirmation may be required before server submission.

Example:

``` text
Select LOT 04?
This selection cannot be changed.
```

Only after successful server response should reveal begin.

------------------------------------------------------------------------

# 27. Lot Reveal

Full-screen.

Sequence: 1. Selected lot centers. 2. Background dims. 3. Card scales
slightly. 4. Optional 3/2/1. 5. Card flips. 6. Player image appears. 7.
Name. 8. Position. 9. Team logo/name. 10. "ASSIGNED TO \[TEAM\]".

After reveal: - Continue / Next Team for Organizer. - Team Owner
receives confirmed assignment.

Never reveal before the server has successfully committed the selection.

------------------------------------------------------------------------

# 28. Auction Control --- Organizer

## Mobile

Prioritize one-screen operation.

Top: - Auction status. - Connection status.

Player: - Large photo. - Name. - Position. - Base price.

Bid: - Current bid large. - Highest team. - Bid history compact.

Controls: - Pause. - SOLD. - UNSOLD. - Next player.

Team quick controls may appear in a bottom sheet for Organizer-entered
offline bids.

## Desktop

Three-column concept:

``` text
Player        Current Auction        Teams/Bid History
```

Do not require desktop for auction operation.

------------------------------------------------------------------------

# 29. Auction Room --- Team Owner

This is one of the most important mobile screens.

Layout:

``` text
LIVE AUCTION

[Player Photo]

PLAYER NAME
Outside Hitter

Current Bid
₹ 8,000

Highest
Team Falcons

Your Purse
₹ 42,000

Next Bid
₹ 9,000

[ BID ₹9,000 ]

Squad 5 / 10
```

BID button: - large, - reachable with thumb, - disabled while request is
pending, - disabled when offline, - disabled when team cannot bid.

Do not optimistically show the user as highest bidder before server
acceptance.

When outbid: - obvious but non-blocking feedback.

When SOLD: - full-screen/large SOLD confirmation if user's team wins. -
normal sale result if another team wins.

------------------------------------------------------------------------

# 30. Public Auction View

No controls.

Show: - player, - current bid, - highest team, - status, - recent
accepted bid movement, - SOLD reveal.

Designed for phones and presentation screens.

Avoid showing private purse information unless Organizer explicitly
enables it.

------------------------------------------------------------------------

# 31. Scoring Screen

The Scorer UI must be extremely simple.

Mobile portrait concept:

``` text
FINAL / MATCH 12
SET 2

Team A            Team B
   18                17

[ +1 A ]          [ +1 B ]

Sets
  1                  0

Set 1: 25–21

[ Undo Last Point ]

Connection: Online
```

Requirements: - Team logos/names. - Huge score numbers. - Huge +1
controls. - Enough spacing to prevent wrong-team taps. - Clear set
state. - Undo separated from +1 buttons. - Confirmation for unusual
corrections if needed.

Do not put navigation controls near +1 buttons.

------------------------------------------------------------------------

# 32. Score Feedback

After point: - subtle score bump/scale. - optional short haptic-like
visual response. - no long animation.

After set win: - clear set-complete banner. - brief transition into next
set.

After match win: - winner state. - final set scores. - "Match
Completed".

------------------------------------------------------------------------

# 33. Public Live Scoreboard

Mobile:

``` text
LIVE
Semi Final

TEAM A
1 set

18

vs

17

TEAM B
0 sets

Set 2
Previous: 25–21
```

Large-screen presentation: - team logos larger, - score extremely
large, - tournament identity, - current set, - previous sets, - sponsor
strip if configured.

No controls.

------------------------------------------------------------------------

# 34. Fixtures

## Mobile

Fixture cards:

``` text
ROUND 3
20 SEP • 7:00 PM
Court 1

Team A
vs
Team B

Scheduled
```

## Desktop

Table/calendar view can be offered.

Filters: - stage, - date, - team, - status.

------------------------------------------------------------------------

# 35. Results

Result card:

``` text
COMPLETED

Team A   2
Team B   1

25–21
22–25
15–12

View Match
Create Result Poster
```

Organizer sees media action. Public does not see administrative actions.

------------------------------------------------------------------------

# 36. Standings

Desktop table:

``` text
Pos | Team | P | W | L | SW | SL | PF | PA | Pts
```

Mobile: - compact horizontal table if usable, or - team ranking cards.

Keep position and team visible.

Provide tie-break explanation where relevant.

------------------------------------------------------------------------

# 37. Knockout Bracket

Desktop: - traditional horizontal bracket.

Mobile: - round-by-round vertical experience.

Example:

``` text
Quarterfinal
[Match Cards]

Semifinal
[Match Cards]

Final
[Match Card]
```

Do not force a giant horizontally scrolling desktop bracket onto a 320px
screen.

------------------------------------------------------------------------

# 38. Team Page

Show: - team logo/name/place, - owner, - squad, - tournament record, -
upcoming fixtures, - recent results.

Auction League may show acquisition amount only if product rules make it
public.

------------------------------------------------------------------------

# 39. Player Public Page

Show only approved public fields: - photo, - name, - position, - current
team, - tournament stats, - recent matches/history where applicable.

Never expose private contact information publicly.

------------------------------------------------------------------------

# 40. Purse & Transactions

Team Owner:

Large card:

``` text
Remaining Purse
₹42,000
```

Secondary:

``` text
Starting ₹50,000
Spent ₹8,000
```

Transaction list:

``` text
-₹8,000  Player Name  PURCHASE
```

Organizer adjustments clearly labeled:

``` text
+₹2,000  ADJUSTMENT
Reason: ...
```

------------------------------------------------------------------------

# 41. Template Library

Grid of visual templates.

Categories: - Fixtures. - Results. - Auction. - Lot. - Teams. -
Players. - Tournament.

Each card: - preview, - name, - format, - Edit, - Generate.

------------------------------------------------------------------------

# 42. Template Editor

## Mobile

Controlled editor.

Sections: - Content. - Image. - Colors. - Sponsors. - Preview.

Use bottom sheets/forms.

Do not attempt a full desktop-style freeform canvas editor on a phone.

## Desktop

Can offer: - canvas, - layer list, - property panel, - preview/export.

------------------------------------------------------------------------

# 43. Notifications

Notification center: - unread indicator, - tournament identity, -
concise action-oriented message, - timestamp.

Examples: - "Your team application was approved." - "Icon Lot starts at
7:00 PM." - "It is your team's turn to pick a lot." - "You were selected
by Team Falcons." - "Match 12 has been rescheduled."

------------------------------------------------------------------------

# 44. Search & Filters

Use search/filter patterns consistently.

Mobile: - Search bar. - Filter button. - Bottom-sheet filters.

Desktop: - Search + inline filters.

Always show active filter count.

Provide "Clear filters".

------------------------------------------------------------------------

# 45. Forms

Rules: - Label above input. - Required state visible. - Inline
validation. - Preserve entered values after validation error. - Mobile
keyboard/input type appropriate to field. - Numeric currency fields
formatted clearly. - Destructive actions never use ambiguous labels.

Avoid placeholder-only labels.

------------------------------------------------------------------------

# 46. Dialogs & Bottom Sheets

Mobile: - Prefer bottom sheets for contextual actions. - Full-screen
sheet for complex review/edit flows.

Desktop: - Dialog/drawer.

Critical confirmations: - Cancel Lot. - Restart Lot. - SOLD
correction. - Purse adjustment. - Result correction. - Delete/archive
tournament.

Require a reason where audit rules require one.

------------------------------------------------------------------------

# 47. Empty States

Every major page needs a purposeful empty state.

Examples:

### No Players

"No players have registered yet." Action: Copy Registration Link / Show
QR.

### No Teams

"No teams are approved yet." Action: Open Team Registration / Add Team.

### No Fixtures

"Fixtures haven't been generated." Action: Generate Fixtures.

### No Auction

"Auction setup is not complete." Action: Configure Auction.

Do not show blank white pages.

------------------------------------------------------------------------

# 48. Loading States

Use skeletons for: - lists, - dashboard cards, - player/team cards, -
public fixtures/results.

For critical mutations: - keep the current screen visible, - show action
pending, - disable duplicate submission.

Avoid replacing an active auction/scoring screen with a full-page
spinner.

------------------------------------------------------------------------

# 49. Error States

Errors should explain: 1. What failed. 2. Whether state is safe. 3. What
the user can do.

Example: "Bid was not accepted. The current bid changed before your
request reached the server."

Action: "Refresh bid" or automatically reconcile.

Avoid generic "Something went wrong" for competitive actions.

------------------------------------------------------------------------

# 50. Connectivity UI

Live operations must always have subtle connection status.

States:

``` text
Online
Reconnecting
Offline
```

When offline: - critical mutation controls disabled, - current displayed
state marked as potentially stale, - reconnect automatically.

After reconnect: - refetch, - reconcile, - then restore controls.

------------------------------------------------------------------------

# 51. PWA Install UX

Do not aggressively show install prompts on first page load.

Good moments: - after login, - after user joins a tournament, - from
Profile/More, - after repeated usage.

Copy: "Install app for quicker access during the tournament."

Public spectators do not need to install.

------------------------------------------------------------------------

# 52. PWA Update UX

If an update is available:

Normal screens: - "New version available --- Update".

During active scoring/auction/lot: - do not force refresh. - indicate
update can be applied after the live operation.

------------------------------------------------------------------------

# 53. QR Code UX

QR codes are needed for: - Team Owner registration. - Player
registration. - Public tournament/live page.

Organizer screen: - large QR preview, - Copy Link, - Download/Share QR
where implemented, - clearly label destination.

QR should never be the only way to access a flow; always provide
URL/copy action.

------------------------------------------------------------------------

# 54. Presentation Mode

Presentation mode is a separate read-only visual mode.

Possible states: - Tournament welcome. - Icon shuffle. - Icon reveal. -
Setter shuffle. - Setter reveal. - Auction. - Live scoreboard. -
Result. - Champion.

No: - sidebar, - edit buttons, - settings, - admin controls.

Allow fullscreen browser usage.

------------------------------------------------------------------------

# 55. Accessibility

Minimum: - semantic buttons. - form labels. - visible focus states. -
keyboard navigation for management screens. - adequate contrast. - touch
targets approximately 44px minimum where practical. - alt text for
meaningful images. - reduced-motion support. - do not communicate status
through color alone.

------------------------------------------------------------------------

# 56. Animation Guidelines

Use Framer Motion intentionally.

Recommended durations: - micro feedback: 120--220ms. - sheets/dialogs:
180--300ms. - page/section transitions: 200--350ms. - lot reveal:
cinematic but concise. - shuffle: approximately 3--5 seconds total.

Avoid: - animation on every card during normal navigation, - excessive
bouncing, - motion that changes the perceived order of authoritative
data, - blocking users while decorative animation completes.

------------------------------------------------------------------------

# 57. Iconography

Use one consistent icon family.

Icons should support text, not replace important labels.

Good:

``` text
[icon] Fixtures
[icon] Auction
```

Avoid icon-only navigation where the meaning is not universally obvious.

------------------------------------------------------------------------

# 58. Data Density Rules

Organizer desktop may be dense.

Organizer mobile should progressively disclose detail.

Public and Player screens should remain visually spacious.

Never show every database field because it exists.

------------------------------------------------------------------------

# 59. Role Experience Summary

## Organizer

Tone: operational, powerful, organized.

Priority: - status, - pending work, - control, - exceptions, - live
operations.

## Team Owner

Tone: competitive and focused.

Priority: - team, - squad, - purse, - lot, - auction, - matches.

## Player

Tone: personal sports profile.

Priority: - registration, - selection, - team, - fixtures, - history.

## Scorer

Tone: minimal and distraction-free.

Priority: - score correctly and quickly.

## Spectator

Tone: live sports experience.

Priority: - what is happening now.

------------------------------------------------------------------------

# 60. Suggested Screen Inventory

## Public

-   Landing.
-   Tournament Home.
-   Live.
-   Fixtures.
-   Results.
-   Table.
-   Bracket.
-   Teams.
-   Team Detail.
-   Players.
-   Player Detail.

## Auth

-   Login.
-   Register.
-   Forgot Password.

## Organizer

-   Dashboard.
-   Tournament List.
-   Create Tournament Wizard.
-   Tournament Overview.
-   Team Owner Applications.
-   Player Registrations.
-   Teams.
-   Team Detail.
-   Players.
-   Player Detail.
-   Lot Overview.
-   Icon Lot Setup.
-   Icon Shuffle.
-   Icon Selection/Reveal.
-   Setter Lot Setup.
-   Setter Shuffle.
-   Setter Selection/Reveal.
-   Auction Setup.
-   Auction Control.
-   Auction History.
-   Squads.
-   Fixtures.
-   Fixture Editor.
-   Matches.
-   Match Detail.
-   Scorer Assignment.
-   Standings.
-   Bracket.
-   Templates.
-   Template Editor.
-   Sponsors.
-   Notifications.
-   Reports.
-   Settings.
-   Audit Log.

## Team Owner

-   Dashboard.
-   Team.
-   Squad.
-   Lot.
-   Auction.
-   Purse.
-   Transactions.
-   Fixtures.
-   Results.
-   Notifications.

## Player

-   Home.
-   Profile.
-   Tournament Registration.
-   Tournament Status.
-   Current Team.
-   Fixtures.
-   Results.
-   History.
-   Notifications.

## Scorer

-   Assigned Matches.
-   Live Scoring.
-   Completed Matches.

------------------------------------------------------------------------

# 61. Screen State Requirement

Every data-driven screen must define:

``` text
Loading
Empty
Loaded
Error
Offline/Reconnecting where relevant
Permission denied where relevant
```

Live screens additionally define:

``` text
Waiting
Ready
Live
Paused
Completed
Cancelled
```

------------------------------------------------------------------------

# 62. Design QA Checklist

Before accepting a screen:

### Responsive

-   320px passes.
-   375px passes.
-   390px passes.
-   768px passes.
-   1024px passes.
-   1440px passes.
-   1920px passes where applicable.
-   No unintended horizontal overflow.

### Interaction

-   Primary action obvious.
-   Touch targets usable.
-   Keyboard/focus works where relevant.
-   Loading state exists.
-   Empty state exists.
-   Error state exists.
-   Disabled state is clear.

### Live Operations

-   Connection state visible.
-   Duplicate submission prevented.
-   Critical state comes from server.
-   Offline action behavior defined.
-   Reconnect behavior defined.

### Visual

-   Typography hierarchy clear.
-   Status not color-only.
-   Long team/player names handled.
-   Missing images have fallback.
-   Tournament branding does not break contrast.

### Role

-   User sees only actions appropriate to role.
-   Public page contains no accidental admin controls.

------------------------------------------------------------------------

# 63. V1 Design Definition of Done

The design system is considered implemented when: - Shared
tokens/components are used consistently. - All core role shells are
responsive. - Tournament setup works at mobile and desktop widths. -
Registration/review flows are complete. - Icon and Setter lot
experiences are complete. - Auction works from Organizer and Team Owner
phones. - Scoring can be operated comfortably with one phone. - Public
live works without login. - Fixtures/results/table/bracket adapt
correctly. - PWA install/update/offline UI is designed. -
Empty/loading/error/reconnect states exist. - Presentation mode works
without admin chrome. - Critical screens pass the responsive QA widths.
