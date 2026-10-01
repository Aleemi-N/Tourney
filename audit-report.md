# TOURNY — FULL LOCAL E2E AUDIT REPORT & PRODUCTION INVESTIGATION

**Timestamp:** 2026-09-30  
**Environment:** Local (`http://127.0.0.1:54321`) & Read-Only Linked Production Inspection  
**Audit Status:** COMPLETE (Find Issues Only — No Code/DB Modifications Performed)

---

## EXECUTIVE SUMMARY: URGENT PRODUCTION DATA INVESTIGATION

### Key Finding: PRODUCTION DATA IS NOT DELETED
The 27 player registrations for **EDAVA VOLLEYBALL LEAGUE** (`edava-volleyball-league`) **STILL EXIST IN FULL** in the production database.

- **Tournament Name:** EDAVA VOLLEYBALL LEAGUE
- **Slug:** `edava-volleyball-league`
- **Tournament ID:** `755a49b0-9d33-4537-aa4c-86aa7f770975`
- **Actual Player Registrations in DB:** **27** (26 `PENDING`, 1 `REJECTED`)
- **Actual Team Owner Applications in DB:** **0**
- **Data Loss Status:** **NO DATA WAS DELETED.**

---

## REQUIRED PRODUCTION AUDIT RESPONSES

| Item | Metric / Question | Value / Finding |
| :--- | :--- | :--- |
| **A** | **Current Deployed Commit** | `9559d0b` (`fix(scoring): update default match timeout duration from 30 seconds to 15 seconds`) |
| **B** | **Last Known Working Commit** | `ee84bf0` (`feat(ui): complete responsive platform polish`) |
| **C** | **Production Tournament ID** | `755a49b0-9d33-4537-aa4c-86aa7f770975` |
| **D** | **Actual Player-Registration Row Count** | **27** (26 `PENDING`, 1 `REJECTED`) |
| **E** | **Actual Owner-Application Row Count** | **0** |
| **F** | **Whether 27 Records Still Exist** | **YES.** All 27 rows are intact in the PostgreSQL production database. |
| **G** | **Whether Organizer Can SELECT Them** | **YES.** Organizer accounts (`4ea1b30f-e37a-457d-aebf-b94ad10abe47` & `1d8a58d0-ae46-46d3-8cd7-edbaa5a840e9`) have active status in `tournament_members` and pass RLS `is_tournament_member()`. |
| **H** | **Exact Query Producing 0** | `supabase.from('player_tournament_registrations').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId)` in `TournamentStatsServer.tsx` & `DashboardTournamentsServer.tsx`. |
| **I** | **Exact Cause of Discrepancy** | Unauthenticated rendering fallback / cookie session handling change in commit `b7dc95e` & `4dd81c4` combined with Next.js Server Component page caching. Under unauthenticated evaluation, RLS evaluates `auth.uid()` as `NULL`, returning 0 count. |
| **J** | **Was Production Data Deleted?** | **NO.** 0 rows were deleted. |

---

## SECTION 0: LOCAL SETUP & BASELINE RESULTS

### 0.1 Local Supabase Status
- **Supabase Local URL:** `http://127.0.0.1:54321` (Verified in `.env.local`)
- **DB URL:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Mailpit URL:** `http://127.0.0.1:54324`
- **Database Reset:** `npx supabase db reset` executed cleanly from zero. All 36 migrations applied without errors. Seed data populated.

### 0.2 Baseline Checks
- **Typecheck (`npx tsc --noEmit`):** ✅ PASSED (0 errors).
- **Linter (`npm run lint`):** ❌ FAILED (5 errors, 11 warnings).
  - *Errors:* 5 instances of `Unexpected any` (`@typescript-eslint/no-explicit-any`) in `src/app/actions/auth.ts` (lines 68, 119, 161, 192, 229).
  - *Warnings:* 4 instances of `<next/no-img-element>` in `AssignPlayerModal.tsx`, `OrganizerAddPlayerModal.tsx`, and `squad/page.tsx`. 7 unused variable warnings in test files.
- **Build (`npm run build`):** ✅ PASSED in 4.0s (24 static/dynamic routes compiled).

---

## SECTION 1: DATABASE AUDIT FINDINGS

### 1.1 Table & RLS Inventory
- **Total Application Tables:** 46
- **RLS Enabled:** 46 / 46 (100% of tables have RLS enabled).

### 1.2 RLS Execution Privilege Finding (CRITICAL)
- **Finding ID:** `DB-01` (Severity: High)
- **Area:** Database / RLS Helper Functions
- **Description:** Migration `0036` executed `REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC`. This revoked execution of security definer helper functions such as `is_tournament_member` and `is_platform_super_admin` from the `anon` pseudorole.
- **Impact:** When an anonymous spectator attempts to view a public tournament, the RLS policy `tournaments_select_policy` attempts to execute `is_tournament_member(id)`. Because `anon` lacks execute permissions, PostgreSQL throws error `42501: permission denied for function is_tournament_member`, breaking public spectator SELECT queries on `tournaments` and `player_profiles`.
- **Suggested Fix:** Grant `EXECUTE` on read-only helper functions (`is_tournament_member`, `is_platform_super_admin`, `is_organization_admin`) to `authenticated` AND `anon` (or ensure policy branches bypass functions when `auth.uid()` is null).

---

## SECTION 2: BACKEND & SECURITY AUDIT FINDINGS

### 2.1 Server Action Input & Exception Handling
- **Finding ID:** `BACKEND-01` (Severity: Medium)
- **Area:** Server Actions / Auth
- **Description:** `src/app/actions/auth.ts` contains `any` type casting on catch blocks and returns raw error strings directly from Supabase Auth (`err?.message`).
- **Impact:** Linter flags 5 TypeScript errors (`@typescript-eslint/no-explicit-any`).

### 2.2 Open Redirect Defense
- **Verification:** `getSafeRedirectUrl` in `src/lib/utils/url.ts` checks:
  1. Starts with `/`
  2. Does not start with `//` (protocol relative bypass)
  3. Does not start with `/\\` (backslash bypass)
  4. Decodes URI components to check for embedded absolute URLs.
- **Result:** Malicious `?next=https://evil.com` or `?next=//evil.com` redirects are properly sanitized and blocked.

---

## SECTION 3: UI & PLAYWRIGHT TEST SUITE FINDINGS

### 3.1 Playwright Test Suite Summary
- **Total Tests Executed:** 59
- **Passed:** 23
- **Failed:** 10
- **Skipped / Unreached:** 26

### 3.2 Detailed Test Failure Root Cause Analysis

1. **`qa-phase4-security-definer.spec.ts` (2 failures)**
   - *Test:* `Anonymous users can query public_revealed_lot_state`
   - *Received:* Status 404 (Expected 200).
   - *Root Cause:* View name mismatch between test expectation (`public_revealed_lot_state`) and actual migration schema view name.

2. **`qa-phase4-runtime.spec.ts` (1 failure)**
   - *Test:* `PLAYER PROFILE: anonymous profile mutation rejected`
   - *Received:* String `"permission denied for function update_player_profile"` (Expected regex match `/Unauthenticated|JWT/`).
   - *Root Cause:* PostgreSQL function execution revocation produces error message `"permission denied for function..."` rather than Supabase default JWT unauthenticated message.

3. **`qa-phase4-ui.spec.ts` (2 failures)**
   - *Test:* `player registration redirects to login` & `owner application redirects to login`
   - *Received:* Browser URL `http://localhost:3000/t/test-tournament/register/player`
   - *Root Cause:* Proxy middleware matcher or client page component does not force synchronous server-side redirect before page render.

4. **`qa-phase4-final.spec.ts` (2 failures)**
   - *Test:* `Organizer dashboard shows Back link` & `Public tournament routing`
   - *Received:* Timeout waiting for `waitForURL('http://localhost:3000/')` because login action redirects directly to `/organizer/dashboard` for organizer accounts.

5. **`qa-migration-18.spec.ts` (1 failure)**
   - *Test:* `Migration 18 RLS Policies — team_owner_applications`
   - *Root Cause:* Policy assertion check expecting explicit status error message.

6. **`qa-phase4-auth.spec.ts` (2 failures)**
   - *Test:* `Health endpoint returns 200 OK` & `Player E2E`
   - *Root Cause:* Server port / route context timing during execution.

---

## SUMMARY COUNTS BY SEVERITY & AREA

### By Severity
- **Critical:** 0
- **High:** 1 (`DB-01`: Helper function execute permissions for `anon`)
- **Medium:** 2 (`BACKEND-01`: Linter errors in server actions, `UI-01`: Proxy redirect timing)
- **Low:** 3 (Test suite expectation mismatches, `<img/>` vs `<Image/>` warnings)

### By Area
- **Database (DB):** 1
- **Backend / Auth:** 1
- **UI / Frontend:** 2
- **Test Suite:** 2

---

## CONCLUSION & INVESTIGATION SUMMARY
- **Production Data Integrity:** **100% INTACT.** The 27 registrations for Edava Volleyball League exist in the production database.
- **Root Cause of UI 0 Display:** Session context loss / static page caching in Next.js Server Component rendering under unauthenticated RLS context.
- **Actions Required:** NONE currently executed (per Read-Only Investigation directive). Fixes can be applied in subsequent development phases upon explicit user approval.
