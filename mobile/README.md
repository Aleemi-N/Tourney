# Tourny mobile (Expo)

Player, scorer and public screens on the same API as the web app (the Spring Boot API in `../api` speaks the supabase-js protocol, so only the address changes).

```bash
cp .env.example .env     # EXPO_PUBLIC_API_URL, EXPO_PUBLIC_API_KEY (the deployment's ANON_KEY)
npm install
npx expo start           # press a / i, or scan the QR code with Expo Go
npx expo start --web     # browser build, handy for checking against the API
```

- Android emulator: use `http://10.0.2.2:8080` for the API; a physical phone needs the computer's LAN address (and that origin does not need CORS, only browsers do).
- Design: the same tokens as the web app (indigo palette, Geist font, 16px cards, status pills with a dot, lucide icons), light and dark, with an Appearance choice on the Account tab.
- Home is the web landing page (hero, live and upcoming tournaments, how it works, roles, call to action).
- Screens: Tournaments (table, fixtures, results, live match), My matches (scorer), Account/sign-in, the scorer screen (toss, points, undo, timeouts) and registration.
- `src/lib/court.ts` is a copy of `../src/lib/court.ts` (sides and serve rules); move both into a shared package when the app grows.
- Registration: players and team owners can apply from a tournament that is open (photo/logo upload, colours, reuse of an existing team); the Account tab lists their applications.
- Organizer: Overview (registration open/close, submit for approval), Players (approve/reject), Teams (squads, rename, colours, assign/remove), Fixtures (stage setup, generate, schedule, scorer, match format, walkover/draw, points rules), Lot Draw and Auction control (auction leagues), Standings, Staff, Settings (details, registration and squads, price categories, match format, stage removal), and a five-step tournament wizard with draft resume.
- Team owner portal: dashboard, team overview, player pool, squad, live auction (realtime), fixtures and results.
- Player profile (edit), scorer score correction and reset, TV scoreboard, and the super admin pages (overview, approvals, tournaments, organizers, audit log) from the Account tab.
- Player portal (Account), scorer workspace (My matches) and the organizer dashboard and participant management follow the web portals.
- Fixtures also has Auto-Spread Rest, Easy Reorder and Plan Days per round, and the league progression decision; Settings has the tournament logo upload.
- Push notifications (Account tab switch): match started, player on the auction block, outbid, and lot draw turn. Database triggers queue messages, the API sends them to Expo (`api/.../push/PushDispatcher.java`). Needs an EAS project id and push credentials, and a development or store build (not Expo Go on Android). Taps open the match or the owner auction.
- Share and spread: standings, fixtures and result posters shared as images (WhatsApp and the rest), QR codes for the tournament, registration links and each match, and add-a-match-to-the-calendar.
- Spectators: follow a team, match or tournament without an account (the first follow asks for notification permission). Alerts: match started, final result, and schedule changes (moved, postponed, cancelled; times in IST). Owners and players get schedule changes too. Manage follows on the Account tab.
- Scorer: offline scoring (points are queued on the phone with idempotency keys, kept if the app closes, and sent in order when the connection returns), lineups (starting six I to VI, libero, up to six substitutions per set, libero swaps for back-row players, court diagram that rotates as sides win the serve back), and the player of the match. Lineups and the player of the match show on the public match screen.
- Awards: organizers give tournament awards (Awards tab); they show on the tournament page and on each player page together with player-of-the-match honours.
- Not built: nothing from the web portals is missing. Password reset opens the website on purpose, because the link belongs to the browser that asked for it.
- Verified here only through the web build (`node` + Playwright against the API); no phone or emulator was available.
