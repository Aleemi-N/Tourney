# Tourny v2: release guide

This is the single list for taking v2 live. "Verified" means I ran it here; "Yours" means it needs your accounts, domains or decisions.

## What is verified (2026-10-26)
- Web: typecheck, lint (0 errors), design-token lint, production `pnpm build`.
- 175 script and database tests, 11 API integration tests (auth, data endpoints, uploads, websocket, password reset, hardening).
- API and PostgREST on plain PostgreSQL 17 with the full schema (`deploy/rehearse.sh`).
- Upgrade rehearsal on a fresh production dump: migrations 58 to 71 applied, 48 tables matched row for row, no integrity problems.
- Mobile: typecheck, `expo-doctor` (20/20), Android and iOS production bundles export, and end-to-end flows in the browser build (sign-in, scoring, registration, organizer approvals).
- The unmodified web app runs against the API (register, approve, lot draw, auction, scoring, standings).

## Before going public (yours, in this order)
1. **Rotate the Supabase database password** you pasted in chat on 2026-10-26.
2. **Decide the domains** (`app.<domain>` for the website, `api.<domain>` for the API) and rent the VPS (2 GB RAM is enough to start; Docker installed).
3. **Fill `deploy/.env`** from `deploy/.env.example`: `JWT_SECRET`, `ANON_KEY` (`node deploy/make-anon-key.mjs`), database passwords, and `CONTACT_EMAIL`, the address the privacy policy and terms show.
4. **SMTP for password reset** (Brevo, Resend, or a Gmail app password): fill `SMTP_*` in `.env`. Without it "forgot password" cannot send the link.
5. **Review the Privacy Policy and Terms** (`/privacy`, `/terms`) with someone who knows the rules where your users live. They are accurate to what the app collects, but they are drafts, not legal advice. Add your organization's name and address if you want them shown.
6. **Take a fresh dump and rehearse once more** (`deploy/CUTOVER.md`, step "Before the day"), then run the cutover.
7. **Mobile app stores** (only if you want store listings; Expo Go and the web app work without them):
   - Create the accounts: Google Play Console (one-time fee) and Apple Developer Program (yearly fee).
   - Provide a 1024x1024 app icon (the current one is the 512px web icon), screenshots for each store, a short and a long description, and a public privacy-policy URL (`https://app.<domain>/privacy`).
   - In `mobile/eas.json`, set the production API and site URLs, then `npx eas-cli@latest build --platform all --profile production` and `eas submit`.
8. **Uptime monitoring:** point a free monitor (UptimeRobot, Better Stack) at `https://api.<domain>/actuator/health` and `https://app.<domain>/api/health`.
9. **Backups:** schedule `deploy/backup.sh` nightly (cron line is in the script) and copy the results off the server.

## Known limits (decide if they matter for your launch)
- Access tokens last one hour: a suspended or removed user keeps access until the token expires.
- The live-update socket tells any listener that a match changed (never its contents); public event tables are public by design.
- Single server: no automatic failover. Restores come from the nightly backup.
- Sign-in and sign-up limits are kept in the API's memory, so they reset when it restarts.
- Mobile app: no push notifications, no organizer fixtures/settings screens, no tournament creation wizard (use the website), and no TV scoreboard.
- Google/OAuth sign-in is not supported (the app never used it).
- The web app was not load-tested. A tournament weekend with a few hundred spectators is well within a small VPS; thousands on one live match are untested.

## After launch
- Keep the old Supabase project read-only for a week, then delete it.
- Never run `supabase db push` against it.
- Watch `docker compose logs -f api` for the first day.
