# Volleyball Tournament Platform V1 — Project Rules

This is the Antigravity workspace rules file for the Volleyball Tournament Platform V1.
All agent invocations in this workspace MUST read and follow these rules.

Refer to `/docs/` for the full source documents:
- `/docs/RULE.md` — Engineering & Product Rules (authoritative)
- `/docs/PRD.md` — Product Requirements Document
- `/docs/architecture.md` — Architecture & Database Schema
- `/docs/design.md` — Design System & UX Specification

---

## 1. Project Identity

**Product:** Volleyball Tournament Platform V1
**Sport scope:** Volleyball only (V1). Do NOT expose other-sport UI.
**Delivery:** Responsive Next.js web application + PWA (no native app, no Expo, no React Native).

---

## 2. Locked Technology Stack

Do NOT deviate from this stack without explicit approval and an architecture change discussion.

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, latest stable) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Auth | The Tourny API (`api/`, Spring Boot): own accounts and JWTs |
| Database | PostgreSQL (+ PostgREST behind the API) |
| Realtime | The API's websocket (`postgres_changes` over LISTEN/NOTIFY) |
| Storage | The API's image storage |
| Security | PostgreSQL RLS |
| Critical mutations | PostgreSQL RPC functions |
| Package manager | pnpm |
| Font loading | next/font (never CSS @import for Google Fonts) |

Do NOT introduce a separate Express/Node backend.

---

## 3. Core Authority Rule

> **The browser controls presentation; PostgreSQL controls authoritative tournament state.**

Never trust client-computed values for:
- Winning bid
- Remaining purse
- Squad eligibility
- Lot availability / turn / hidden mapping
- Player assignment
- Current authoritative score / set / match winner
- Tournament membership / role

All critical state transitions must go through verified PostgreSQL RPC functions under RLS.

---

## 4. Security Rules (Non-Negotiable)

1. RLS MUST be enabled on every private or mutable application table.
2. Service-role keys MUST NEVER be exposed to browser bundles.
3. Hidden lot `player_id` values must never be returned to Team Owner or Public clients before reveal.
4. Never fetch hidden lot data and hide it with CSS — prevent it at the query/RLS level.
5. Team Owners may mutate only their own permitted team data.
6. Players cannot approve themselves or set auction classification.
7. Scorers may score only assigned matches.
8. Never rely on UI hiding as authorization — backend authorization is mandatory.

---

## 5. Rendering Rules

- Use Next.js Server Components / SSR / static rendering for public pages, initial load, SEO, shareability.
- Use Client Components only where browser state, forms, animations, PWA APIs, or realtime are required.
- Lot, auction, scorer, and live screens are interactive client experiences.
- Public tournament metadata / fixtures / results prefer server rendering with realtime islands only where necessary.

---

## 6. API Client Pattern

Three separate helpers — never mix them:

| Helper | File | Used in |
|---|---|---|
| Browser client | `src/lib/api/client.ts` | Client Components |
| Server client | `src/lib/api/server.ts` | Server Components, Route Handlers |
| Proxy client | within `src/proxy.ts` | Proxy (Next.js 16 replacement for middleware) |

> Note: In Next.js 16, `middleware.ts` is deprecated. Use `src/proxy.ts` with an exported `proxy` function instead of `middleware`.

All three build the same client (`src/lib/api/core.ts`; mobile has a copy made by `scripts/sync-client.mjs`). The session lives in the `tourny-session` cookie; the proxy renews it before Server Components read it.

---

## 7. Database Conventions

- Primary keys: UUID (`gen_random_uuid()`)
- Timestamps: `timestamptz` always
- Naming: snake_case for database identifiers
- TypeScript: camelCase / PascalCase
- URL paths: lowercase kebab-case
- Use `team_owner` consistently (not `franchise_owner`)
- Every schema change requires a migration file — never mutate production schema without migration history
- All migrations must be tested: RLS, RPC, affected integration tests before promotion

---

## 8. User Roles

Five roles with distinct experiences:
1. **Organizer** — creates/manages tournaments, runs lot/auction, manages fixtures, corrects results
2. **Team Owner** — manages own team, participates in lot/auction for own team only
3. **Player** — reusable profile across tournaments, submits registration
4. **Scorer** — scores only assigned matches, no admin access
5. **Spectator** — public read-only, no account required

Role experiences must be genuinely different — NOT one dashboard with hidden menus.

---

## 9. Route Structure

Route groups in `src/app/`:
```
(public)/      — Public spectator pages
(auth)/        — Login, register, password reset
(organizer)/   — Organizer-only management
(owner)/       — Team Owner portal
(player)/      — Player portal
(scorer)/      — Scorer portal
```

---

## 10. Design System

- Design tokens defined as CSS custom properties in `src/app/globals.css`
- Token mapping in Tailwind config
- Application UI tokens + per-tournament brand token slots (never hard-code one tournament's colors)
- Dark mode: supported via CSS custom properties
- Status must NEVER be communicated by color alone (always include label/icon)
- Font: loaded via `next/font` (never CSS `@import`)
- Breakpoints: 320 / 375 / 390 / 768 / 1024 / 1440 / 1920px
- Mobile-first from 320px

---

## 11. PWA Rules

- Installable manifest configured
- Use service worker for static asset caching only (app shell, fonts, icons)
- NEVER cache authoritative competitive state (bids, purse, lot state, live scores, match completion)
- If offline during lot/auction/scoring: show Reconnecting/Offline, disable unsafe mutation controls, refetch on reconnect

---

## 12. Realtime Rules

- Use the API's live updates (`api.channel(...).on('postgres_changes', ...)`) for live synchronization
- Subscribe only to required scoped data — never subscribe to whole tables globally
- Realtime is synchronization only — NOT the source of truth
- On reconnect: refetch authoritative state before resuming critical actions
- Show explicit connection state during live competitive operations

---

## 13. Audit Requirements

Audit log entries required for (minimum):
- Lot cancellation/restart
- Lot correction
- Auction manual adjustment / sale correction / refund
- Purse adjustment
- Player reassignment
- Result correction
- Score correction
- Team Owner transfer
- Important tournament rule changes after activation

---

## 14. Completion Definition

A feature is NOT complete because the screen looks correct.

Complete means ALL of:
- Authorization is correct (backend, not UI-hiding)
- RLS is correct
- Mutation is safe (via RPC where required)
- Realtime reconciliation works
- Error / loading / offline states exist
- Mobile + tablet + laptop layouts pass (320–1920px)
- Tests pass
- Audit behavior exists where required

---

## 15. Testing Cadence

| Change type | Required checks |
|---|---|
| Small edit | Targeted tests |
| Completed feature/module | Targeted tests + typecheck + lint |
| End of phase / lock | Full typecheck + lint + production build + DB/RLS/RPC integration suite + responsive checks |
| Auction/lot/scoring/security changes | Real PostgreSQL integration tests + concurrency tests + permission-negative tests |

---

## 16. Current Delivery Phase

**Phase 1 — Foundation** (in progress / completed):
- Next.js app initialized
- API client/server/proxy helpers
- Design token system
- Route group structure
- PWA manifest foundation

**Phase 2 and beyond**: Do NOT start Phase 2 (database migrations, RLS, RPC) until explicitly approved.

---

## 17. What Requires Credentials Before It Works

The following features need `NEXT_PUBLIC_API_URL` in `.env.local` (the API running, `pnpm db:reset` for a seeded local database):
- All API client connections
- Auth flows
- Database queries
- Realtime subscriptions
- Storage uploads

Create `.env.local` from `.env.example`.
