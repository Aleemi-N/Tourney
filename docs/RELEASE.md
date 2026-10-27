# Tourny v2: release guide

This is the single list for taking v2 live. "Verified" means I ran it here; "Yours" means it needs your accounts, domains or decisions.

## What is verified (2026-10-26)
- Web: typecheck, lint (0 errors), design-token lint, production `pnpm build`.
- 175 script and database tests, 11 API integration tests (auth, data endpoints, uploads, websocket, password reset, hardening).
- API and PostgREST on plain PostgreSQL 17 with the full schema (`deploy/rehearse.sh`).
- Upgrade rehearsal on a fresh production dump: migrations 58 to 71 applied, 48 tables matched row for row, no integrity problems.
- Mobile: typecheck, `expo-doctor` (20/20), Android and iOS production bundles export, and end-to-end flows in the browser build (sign-in, scoring, registration, organizer approvals, fixtures and settings).
- The unmodified web app runs against the API (register, approve, lot draw, auction, scoring, standings).

## Before going public (yours, in this order)
1. **Rotate the Supabase database password** you pasted in chat on 2026-10-26.
2. **Decide the domains** (`app.<domain>` for the website, `api.<domain>` for the API) and rent the VPS (2 GB RAM is enough to start; Docker installed).
3. **Fill `deploy/.env`** from `deploy/.env.example`: `JWT_SECRET`, `ANON_KEY` (`node deploy/make-anon-key.mjs`), database passwords, and `CONTACT_EMAIL`, the address the privacy policy and terms show.
4b. **Razorpay card payments (optional; UPI fees need nothing):** make a key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, put it in `deploy/.env` as `SECRETS_KEY`, and back it up with the file. It encrypts the Razorpay keys organizers connect; if you lose or change it, they must reconnect. Without it organizers can still set fees and mark players paid by hand, just not take payments online.
4a. **Browser push (optional):** run `node deploy/make-vapid-keys.mjs`, put the three `VAPID_*` lines in `deploy/.env`, and rebuild the web image (the public key is compiled in). Without them the website simply hides the Follow buttons.
4. **SMTP for password reset** (Brevo, Resend, or a Gmail app password): fill `SMTP_*` in `.env`. Without it "forgot password" cannot send the link.
5. **Review the Privacy Policy and Terms** (`/privacy`, `/terms`) with someone who knows the rules where your users live. They are accurate to what the app collects, but they are drafts, not legal advice. Add your organization's name and address if you want them shown.
6. **Take a fresh dump and rehearse once more** (`deploy/CUTOVER.md`, step "Before the day"), then run the cutover.
7. **Mobile app stores** (only if you want store listings; Expo Go and the web app work without them):
   - Create the accounts: Google Play Console (one-time fee) and Apple Developer Program (yearly fee).
   - Provide a 1024x1024 app icon (the current one is the 512px web icon), screenshots for each store, a short and a long description, and a public privacy-policy URL (`https://app.<domain>/privacy`).
   - Push notifications (match started, player on the block, outbid, lot draw turn) need an Expo project: sign in with `npx eas-cli@latest login`, run `eas init` in `mobile/` (it writes the project id into `app.json`), and add push credentials with `eas credentials` (a Firebase FCM v1 key for Android, an Apple push key for iOS, which comes with the Apple account). They do not work in Expo Go on Android; use a development or store build.
   - In `mobile/eas.json`, set the production API and site URLs, then `npx eas-cli@latest build --platform all --profile production` and `eas submit`.
8. **Uptime monitoring:** point a free monitor (UptimeRobot, Better Stack) at `https://api.<domain>/actuator/health` and `https://app.<domain>/api/health`.
9. **Backups:** schedule `deploy/backup.sh` nightly (cron line is in the script) and copy the results off the server.

## Known limits (decide if they matter for your launch)
- Access tokens last one hour: a suspended or removed user keeps access until the token expires.
- The live-update socket tells any listener that a match changed (never its contents); public event tables are public by design.
- Single server: no automatic failover. Restores come from the nightly backup.
- Sign-in and sign-up limits are kept in the API's memory, so they reset when it restarts.
- Mobile app: everything in the web portals is on mobile, plus push notifications. Push needs the Expo project and credentials above, and the API must be able to reach exp.host.
- Google/OAuth sign-in is not supported (the app never used it).
- The web app was not load-tested. A tournament weekend with a few hundred spectators is well within a small VPS; thousands on one live match are untested.

## Added after the first release pass (all tested here, none tried on a phone or with real push)
- Mobile and web: follow a team, match or tournament without an account, with push alerts for match start, final result, schedule changes and organizer announcements; web push needs the VAPID keys (step 4a).
- Scorer: offline scoring queue, lineups with rotation, substitutions and libero swaps, player of the match; organizer awards.
- Organizer: announcements, check-in with a no-show walkover shortcut, CSV exports, tournament templates, multi-court scheduling, insights.
- Public: posters and QR codes to share, add-to-calendar, searchable directory (`/tournaments`), embeddable widgets (`/embed/t/<slug>/table|fixtures|live/<match id>`).
- Languages: Hindi and Malayalam on the mobile app (draft translations; get them reviewed). The website is English only.
- Registration fees (optional per tournament, separate player and team fee, for player and team registrations alike). The organizer types a **UPI ID** in tournament settings (web or mobile): no account or keys. The payer pays that UPI ID from any UPI app (QR code on the website, a button that opens GPay/PhonePe/Paytm on the phone), then enters the 12-digit UPI reference number. The organizer checks their own UPI app or bank and presses **Confirm received** (or Not received, after which the payer can send the reference again). A reference number can back only one payment. Approval of a registration is blocked, by the database, until it is confirmed, marked paid, or waived. Refunds are sent by the organizer from their own UPI app and then recorded in Tourny. The payer can attach a screenshot (shrunk on their device, readable only by them and the organizers), gets a push alert when the payment is confirmed or not received, and a receipt they can share (mobile) or print (website). The organizer gets a push alert for each payment to confirm, and a daily reminder while any wait more than 12 hours; payers who still owe a fee get up to three reminders, three days apart (the API checks every 30 minutes). Alerts need push to be set up (steps 4a and 7). Tourny never holds the money and **cannot confirm a UPI payment by itself**: the organizer confirms. **Tax and GST are not handled.**
- Optional card payments: an organizer who has a Razorpay account can connect their own keys (settings, "Card payments with Razorpay"); the payer then pays on Razorpay's page, Tourny reads the result from Razorpay and confirms automatically, and refunds go through Razorpay. This needs `SECRETS_KEY` (step 4b). Tested only against a fake Razorpay server: try a Razorpay *test* key first. Automatic confirmation for everyone would need a payment gateway account of your own (a business decision, left out).
- Real push delivery to phones and browsers could not be tried here: browsers were tested with a stubbed subscription and phones against a fake Expo server.

## After launch
- Keep the old Supabase project read-only for a week, then delete it.
- Never run `supabase db push` against it.
- Watch `docker compose logs -f api` for the first day.
