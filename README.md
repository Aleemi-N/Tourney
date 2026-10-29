This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Local development

Needs Docker, Node 24 with pnpm, and Java 25 (the API uses the bundled `./mvnw`).

```bash
pnpm install
pnpm db:reset                                    # PostgreSQL 17 + PostgREST in Docker, seeded (accounts in db/seed.sql)
cp .env.example .env.local                       # NEXT_PUBLIC_API_URL=http://localhost:8080
(cd api && SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run)   # the API on :8080
pnpm dev                                         # the website on :3000
```

Tests: `pnpm test` (database and client tests, after `pnpm db:reset`), `cd api && ./mvnw test`, and `tests/e2e-journey.mjs` for the full lifecycle (see its header). The mobile app is in `mobile/` (see its README).
