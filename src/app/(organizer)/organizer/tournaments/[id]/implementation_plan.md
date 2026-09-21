# Zero-Lag Organizer UX Optimization Plan

This plan outlines the architecture changes to achieve near-zero perceived latency for organizer navigation, following the React Streaming & Suspense paradigm.

## 1. Remove `[id]/loading.tsx`
Currently, the full-page `loading.tsx` causes a layout thrash (replacing the entire page content with a skeleton). We will delete `src/app/(organizer)/organizer/tournaments/[id]/loading.tsx`. Instead, we will use fine-grained `<Suspense>` boundaries *inside* each page. This ensures the page shell (titles, breadcrumbs) swaps instantly on click, and only the data sections show a skeleton.

## 2. Stream Participants Data
**Target:** `src/app/(organizer)/organizer/tournaments/[id]/participants/page.tsx`
- Extract the concurrent fetching of `player_tournament_registrations` and `team_owner_applications` into a new Server Component: `ParticipantListServer.tsx`.
- The `ParticipantsPage` will instantly render the static shell and wrap `<ParticipantListServer>` in `<Suspense fallback={<ParticipantsSkeleton />}>`.
- The skeleton will mimic the tabs and grid layout of `ParticipantManager`.

## 3. Stream Overview Counts
**Target:** `src/app/(organizer)/organizer/tournaments/[id]/page.tsx`
- Extract the `Promise.all` fetching of player, application, and team counts into a new Server Component: `TournamentStatsServer.tsx`.
- The `OverviewPage` will instantly render the tournament details and wrap `<TournamentStatsServer>` in `<Suspense fallback={<StatsSkeleton />}>`.

## 4. Stream Settings Data
**Target:** `src/app/(organizer)/organizer/tournaments/[id]/settings/page.tsx`
- Extract the fetching of `tournament_settings` into a new Server Component: `SettingsContainerServer.tsx`.
- The `SettingsPage` will instantly render the title and description, wrapping the container in `<Suspense fallback={<SettingsSkeleton />}>`.

## 5. Stream Dashboard Tournaments
**Target:** `src/app/(organizer)/organizer/dashboard/page.tsx`
- The Dashboard currently sequentially fetches organizations, then tournaments, then counts for each active tournament.
- Extract the tournament and count fetching into a new Server Component: `DashboardTournamentsServer.tsx`.
- The `DashboardPage` will instantly render the "Dashboard" header and "Create Tournament" button, wrapping the list in `<Suspense fallback={<DashboardListSkeleton />}>`.

## 6. Prefetch Strategy
- By moving slow data fetching behind `<Suspense>`, Next.js can resolve the initial RSC payload for dynamic pages essentially immediately (since it only renders static shells and `getTournament` which is cached).
- We will rely on Next.js default prefetching. With Suspense, clicking a link will render the new page shell instantly, achieving the targeted "zero perceived latency" without aggressively pre-warming authenticated user data.

## User Review Required
> [!IMPORTANT]
> - By streaming data, users will see skeletal placeholders for a fraction of a second when navigating. This provides the instant click feedback you requested.
> - `loading.tsx` will be deleted in favor of component-level `<Suspense>` to prevent full-page layout thrashing.
> - Are you okay with extracting these data-fetching blocks into new separate Server Components to enable streaming?
