@AGENTS.md

# gymlog

A workout editor and gym logger. Build templates (exercise, sets, reps, rest), assign them to
days of the week as a program, then log the weight and reps you actually did — in a gym basement
with no signal.

See `docs/plan.md` for the full design and `docs/architecture.md` for how it fits together.

## Non-negotiables

These two constraints shape every file in the repo. Breaking either means a rewrite, not a patch.

### 1. The client reads from IndexedDB, never from the network

Every screen renders off Dexie (`lib/db/dexie.ts`) via `useLiveQuery`. The sync engine
(`lib/sync/`) is the **only** thing that talks to `/api/sync`. No component fetches. No
`isOnline` branches. No server-component data fetch on any screen that gets used at the gym.

A write goes to Dexie and the outbox in **one transaction** — never one without the other.

There are two exceptions, both desk-only and never cached by the service worker:

- `/admin`, a server-rendered view of every account. It reads only through `lib/admin.ts`, which
  checks `users.role` in the database on every call. Sync must never look at the role. Because the
  role never reaches the device, Profile asks `/api/admin/me` (`useIsAdmin()`) whether to show the
  Admin link — the one component fetch in the app, and only ever a hint for that link.
- `/api/v1` and its token page `/profile/api` — the API a user points an LLM at. Tokens are
  `read` or `write`; reads go through `lib/api.ts`, writes through `lib/api-write.ts`, whose
  `commit()` gives every row `updatedAt = now` and a fresh `rev` in one transaction so phones pull
  the change on their next sync. Never write a synced table from the server any other way, and
  never let a token authenticate `/api/sync`.

### 2. Multi-tenant from day zero

One user today, other people tomorrow, and no migration in between.

- Every user-owned row carries `userId`; every read filters on it.
- `userId` comes from the JWT server-side (`currentUserId()` in `lib/auth.ts`), or for `/api/v1`
  from the token's row (`tokenOwner()` in `lib/api-tokens.ts`), and **never** from the request
  payload.
- The seed exercise library is `exercises.userId IS NULL` — global, shared, read-only. A user's own
  exercises are the same table with a non-null `userId`.
- The Dexie database name is namespaced per user id, and logout wipes it. A shared phone must not
  leak one person's log into another's.
- No hardcoded account, no `ADMIN_PASSWORD`, no personal names in code or seed data.

## Conventions

- **IDs are minted on the client** (`lib/id.ts`). UUIDv7 by default; deterministic UUIDv5 for rows
  with a natural key (sessions, set logs, bodyweight, exercise notes) so two offline devices
  compute the same id and sync merges instead of duplicating.
- **Weights are always stored in kg** (`weightKg`). `users.unit` is display only.
- **Calendar dates are `TEXT 'YYYY-MM-DD'`** (`scheduledFor`, `measuredOn`, `startedOn`); every
  other time is an integer epoch-ms. A workout's date is a local fact — a timestamp makes "today"
  wrong the moment you travel.
- **Nothing is hard-deleted.** Set `deletedAt`; an offline device has to learn about deletions.
- **`setLogs.performedAt` is denormalised** from the session date so "last time I lifted X" is one
  index scan (IndexedDB has no joins). Only `rescheduleSession()` may change it.
- `env` and `publicEnv` (`lib/env.ts`, `lib/env.public.ts`) — never `process.env` directly.
- Exercise photos live at `/exercise-media/<id>/{0,1}.webp`, **not** `/exercises/` (that's a route).

## Commands

```bash
npm run dev              # dev server
npm run build            # lint + typecheck + next build
npm run typecheck
npm test                 # vitest
npm run db:generate      # new migration from db/schema.ts
npm run db:migrate       # apply to .env.local target
npm run db:seed
npm run exercises:import # re-import the public-domain exercise library
npm run user:role -- <email> <user|admin>   # grant/revoke admin (user:role:prod for prod)
```

Next 16 renamed `middleware.ts` to `proxy.ts` — route protection lives in `proxy.ts`.

## Testing offline

**Use a production build** — `npm run build && npx next start -p 3001` — then turn the network
off. Under `next dev` the service worker ends up serving pre-edit chunks (dev builds are not
content-hashed and hot reload patches the live page), so offline behaviour looks broken when it
isn't, or fine when it isn't. See `docs/architecture.md`, "Working offline", for the three things
that must hold for the app to open with no signal.
