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
- Organizer: the Account tab links to the tournaments you organize, with approve/reject for player registrations (route and price category) and team applications.
- Player portal (Account), scorer workspace (My matches) and the organizer dashboard and participant management follow the web portals.
- Not built yet: organizer fixtures and settings screens, owner team management, push notifications, score correction/reset and walkover/draw on mobile.
- Verified here only through the web build (`node` + Playwright against the API); no phone or emulator was available.
