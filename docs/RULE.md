# Volleyball Tournament Platform V1 --- Engineering & Product Rules

## 1. Scope Rules

1.  V1 supports Volleyball only.
2.  Do not expose unfinished other-sport options in V1 UI.
3.  Keep generic tournament entities generic enough for future sports.
4.  No Expo or React Native in V1.
5.  Product is a responsive Next.js web application and PWA.

## 2. Locked Stack

-   Next.js.
-   TypeScript.
-   Tailwind CSS.
-   Framer Motion.
-   Supabase Auth.
-   Supabase PostgreSQL.
-   Supabase Realtime.
-   Supabase Storage.
-   PostgreSQL RLS.
-   PostgreSQL functions/RPC for critical state transitions.

Do not introduce a separate Express/Node backend unless architecture is
intentionally revised.

## 3. Rendering Rules

1.  Use Next.js Server Components/SSR/static rendering where it improves
    public pages, initial load, SEO, and shareability.
2.  Use Client Components only where browser state, forms, animations,
    PWA APIs, or realtime interaction require them.
3.  Lot, auction, scorer, and live screens are interactive client
    experiences.
4.  Public tournament metadata/fixtures/results should prefer server
    rendering with realtime islands only where necessary.

## 4. Authority Rule

The browser controls presentation; PostgreSQL/Supabase controls truth.

Never trust client-computed values for: - Winning bid. - Remaining
purse. - Squad eligibility. - Lot availability. - Lot turn. - Hidden
player mapping. - Player assignment. - Current authoritative score. -
Set/match winner. - Tournament membership/role.

## 5. Authentication Rules

1.  Use Supabase Auth for identity.
2.  Never store password hashes in application tables.
3.  `profiles.id` maps to `auth.users.id`.
4.  A user may have multiple contextual roles.
5.  Do not model the entire system using one global `profiles.role`.
6.  Tournament/organization memberships determine permissions.

## 6. RLS Rules

1.  RLS must be enabled on every private or mutable application table.
2.  Public access must use explicit safe policies/views/functions.
3.  Team Owners may mutate only their own permitted team data.
4.  Players may mutate only their own profile/application fields.
5.  Players cannot approve themselves or set auction classification.
6.  Scorers may score only assigned matches.
7.  Public users are read-only.
8.  Organizer access must be scoped to tournaments they manage.
9.  Service-role keys must never be exposed to browser code.
10. Never rely on UI hiding as authorization.

## 7. Lot Rules

1.  Icon Lot and Setter Lot are separate sessions.
2.  Lot sessions have no bidding.
3.  Hidden `player_id` values must not be returned to Team Owner/Public
    clients before reveal.
4.  Never fetch hidden values and hide them only with CSS.
5.  Shuffle must create a locked mapping before selections begin.
6.  Once locked, the mapping cannot be silently edited.
7.  A team can select only during its active turn.
8.  A lot can be selected only once.
9.  A team can complete only its allowed number of picks.
10. Lot selection + reveal + player assignment must be atomic.
11. Cancellation/restart requires a reason and audit record.
12. Completed historical sessions remain immutable except through
    explicit administrative correction workflows.

## 8. Auction Rules

1.  Main auction is separate from Icon/Setter lots.
2.  Only one player is active for bidding at a time unless a future
    auction mode explicitly changes this.
3.  A bid must be validated server-side.
4.  The client must not directly insert arbitrary accepted bid rows.
5.  Bid amount must satisfy configured increment/base rules.
6.  Team must have sufficient purse.
7.  Team must satisfy squad constraints.
8.  Player must remain eligible and unsold.
9.  Team Owner may bid only for their own team.
10. Organizer may enter an offline/physical bid on behalf of a team.
11. Concurrent bids are resolved by the authoritative server/database
    operation.
12. `SOLD` finalization is transactional.
13. Player cannot be sold twice.
14. Purse cannot become negative.
15. Purse history must use a ledger; do not only overwrite balance.
16. UNSOLD players can enter a re-auction pool.
17. Auction corrections require reason + audit entry.

## 9. Purse Rules

1.  Store starting balance, spent amount, and remaining balance.
2.  Every financial/purse mutation creates a transaction row.
3.  Prefer recalculable/verified balances.
4.  Manual adjustment requires Organizer permission and reason.
5.  Refunds must reference the reason/source when possible.
6.  Never let a Team Owner directly update wallet balance.

## 10. Player Rules

1.  Player profile is reusable across tournaments.
2.  Player chooses volleyball position, not Icon status.
3.  Organizer classifies approved registration into Icon Lot, Setter
    Lot, or Main Auction.
4.  One player cannot belong to two active teams in the same tournament.
5.  Manual player addition must still produce consistent
    player/tournament records.
6.  Public player views expose only intended public fields.

## 11. Team Owner Rules

Registration modes: - OPEN. - INVITE_ONLY. - ORGANIZER_ADDED.

Approval should atomically create/link the team and owner membership
where required.

A Team Owner cannot: - Change another team. - Change another team's
purse. - Change hidden lot mapping. - Approve players. - Finalize
auction sales unless explicitly granted an Organizer role.

## 12. Volleyball Scoring Rules

1.  Scoring is configurable per tournament/stage.
2.  Support BO3, BO5, and custom rules.
3.  Store target score per set.
4.  Store sets required to win.
5.  Support Win by 2 ON/OFF.
6.  Never hard-code final-set target to 15 in the scoring engine; read
    configured rule.
7.  Match scoring must be driven by the rule assigned to the
    match/stage.
8.  Set completion is determined server-side.
9.  Match completion is determined server-side.

## 13. Score Event Rules

1.  Never treat `UPDATE score = score + 1` from the browser as
    authoritative.
2.  Use controlled RPC/function for point award.
3.  Store score-event history.
4.  Undo must reference/reverse the correct prior state, not blindly
    subtract one.
5.  Corrections require permissions and should be auditable.
6.  Prevent duplicate point processing using
    transaction/locking/idempotency strategy.
7.  Completed matches should not accept normal point events.
8.  Result correction after completion must use a separate controlled
    workflow.

## 14. Fixture & Bracket Rules

1.  League fixtures support automatic round robin and manual scheduling.
2.  Knockout winner progression is derived from completed match result.
3.  Next-match progression must be idempotent.
4.  A corrected prior result must safely reconcile downstream
    progression or require explicit Organizer resolution if downstream
    matches have already started.
5.  Rescheduling must retain history/audit where important.

## 15. Standings Rules

1.  Standings are derived/cached state, not the only source of truth.
2.  They must be rebuildable from completed matches.
3.  Points and tie-break configuration belongs to tournament/stage
    settings.
4.  Do not hard-code one club's league-points system globally.
5.  Rebuild/update after finalized result changes.

## 16. Realtime Rules

1.  Use Supabase Realtime for live synchronization.
2.  Subscribe only to required scoped data.
3.  Realtime is a synchronization mechanism, not the source of truth.
4.  On reconnect, refetch authoritative state before resuming critical
    actions.
5.  Do not blindly replay stale BID, LOT PICK, SOLD, or SCORE actions.
6.  Show explicit connection state during live competitive operations.

## 17. Offline/PWA Rules

Cache: - App shell. - Icons. - Fonts. - Static branding. - Safe static
assets.

Do not use stale cache as authoritative for: - Current bid. - Current
purse. - Active lot turn. - Lot availability. - Hidden/revealed lot
state. - Live score. - Match completion.

If critical connectivity is unavailable: - Disable unsafe actions. -
Show Reconnecting/Offline. - Restore state from server after reconnect.

## 18. Storage Rules

Use Supabase Storage with explicit bucket policies.

Suggested logical buckets: - avatars. - player-photos. - team-logos. -
tournament-assets. - sponsor-assets. - template-assets. -
generated-media.

Rules: 1. Validate file type and size. 2. Use unique object paths. 3.
Restrict write access by ownership/role. 4. Public assets may be
public-readable but not public-writable. 5. Future identity/private
documents must use private buckets/signed URLs.

## 19. UI Rules

1.  Mobile-first from 320px.
2.  Do not squeeze desktop tables into mobile.
3.  Use cards/sheets on mobile.
4.  Use large touch targets for auction/lot/scoring.
5.  Full-screen competitive modes should remove unrelated navigation.
6.  Presentation Mode is read-only and contains no admin controls.
7.  Public/Spectator UI is simpler than Organizer UI.
8.  Organizer, Owner, Player, Scorer, and Public experiences must not be
    one giant dashboard with hidden menus.
9.  Support reduced motion for shuffle/reveal animations.
10. Always provide non-animation state clarity after transitions.

## 20. Responsive QA Rules

Minimum required visual checks: - 320px. - 375px. - 390px. - 768px. -
1024px. - 1440px. - 1920px.

Check: - No horizontal overflow. - No clipped controls. - Touch targets
remain usable. - Dialogs/sheets fit viewport. - Auction bid button
remains reachable. - Score controls remain reachable. - Lot cards remain
selectable. - Presentation mode scales cleanly.

## 21. Audit Rules

Audit at minimum: - Lot cancellation/restart. - Lot correction. -
Auction manual adjustment. - Auction sale correction/refund. - Purse
adjustment. - Player reassignment. - Result correction. - Score
correction. - Team Owner transfer. - Important tournament rule changes
after tournament activation.

Audit row should capture: - Actor. - Tournament. - Action. - Entity. -
Before. - After. - Reason where required. - Timestamp.

## 22. Database Rules

1.  Use UUID primary keys unless there is a strong reason otherwise.
2.  Use `timestamptz` for timestamps.
3.  Use foreign keys.
4.  Add unique constraints for domain invariants.
5.  Add indexes for foreign keys and common filters.
6.  Use CHECK constraints/enums/domain validation where useful.
7.  Prefer soft status transitions over destructive deletion for
    competitive history.
8.  Use migrations; never manually mutate production schema without
    migration history.
9.  Keep RPC functions versioned in migrations.
10. Critical transactions must lock required rows.

## 23. Migration Rules

Every schema change: 1. Create migration. 2. Apply locally/dev. 3.
Regenerate TypeScript database types. 4. Run schema tests. 5. Run
affected RLS tests. 6. Run affected RPC/integration tests. 7. Only then
promote.

## 24. Testing Cadence

Small edit: - Targeted tests.

Completed feature/module: - Targeted tests. - Typecheck. - Lint.

End of phase / before locking: - Full typecheck. - Full lint. -
Production build. - Database/RLS/RPC integration suite. - Responsive
checks for changed screens.

Critical auction/lot/scoring/security changes: - Real
PostgreSQL/Supabase integration tests. - Concurrency tests. -
Permission-negative tests.

## 25. Required Security Tests

Examples: - Owner A cannot read/write Owner B private data. - Player
cannot set approved status. - Player cannot set Icon category. - Scorer
cannot score unassigned match. - Public cannot read hidden lot
mapping. - Owner cannot bid for another team. - Owner cannot directly
change purse. - Duplicate SOLD cannot assign same player twice. -
Duplicate lot pick cannot assign same lot twice. - Public cannot write
any tournament state.

## 26. Naming Rules

-   Use clear English technical names.
-   Database names: snake_case.
-   TypeScript variables/types: camelCase/PascalCase.
-   URL paths: lowercase kebab-case where appropriate.
-   Do not use ambiguous names such as `data1`, `status2`, `typex`.
-   Use `team_owner` consistently, not mixed `franchise_owner` unless
    product terminology changes.

## 27. Completion Rule

A feature is not complete because the screen looks correct.

It is complete only when: - Authorization is correct. - RLS is
correct. - Mutation is safe. - Realtime reconciliation works. -
Error/loading/offline states exist. - Mobile/tablet/laptop layouts
pass. - Tests pass. - Audit behavior exists where required.
