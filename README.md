# gymlog

[![CI](https://github.com/iloire/gymlog/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/iloire/gymlog/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/live-gymlog--pi--eosin.vercel.app-0057b8)](https://gymlog-pi-eosin.vercel.app)

Build your workouts, put them on the days you train, then log the weight and reps you actually
did — **with or without signal**. Made for a gym in a basement.

![gymlog: today's workout, logging a set, the exercise library and bodyweight trend](docs/screenshots/gymlog.png)

The CI badge is green only when a commit's **unit tests pass, it builds, and that same commit
deployed to production** — the workflow waits for Vercel's verdict and smoke-tests the live site.

## What it does

- **Workouts** — an ordered list of exercises with sets, reps and rest.
- **Premade programmes** — pick a ready-made week (full body, upper/lower, dumbbells only), fitted
  to the equipment you have: exercises you can't do are swapped for ones you can.
- **Your week** — put a workout on each training day. Moving up a stage starts a new programme;
  everything you logged before stays exactly as it was.
- **The gym screen** — one exercise at a time, big thumb-sized steppers, prefilled with what you
  just lifted or what you did last time, a rest timer that beeps, and the screen kept awake.
- **Exercise library** — 859 movements, each with a start and end photo that fade into one
  another to show the movement.
- **Bodyweight** — one tap a day, charted as a 7-day average because single readings are noise.
- **Accounts** — every user sees only their own data; the exercise library is shared.
- **API for LLMs** — create a token under Profile → API access and let ChatGPT, Claude or a script
  read your workouts, history and bodyweight; a read and write token can also rework your workouts
  and week. Described by an OpenAPI schema at `/api/v1/openapi.json`.

## Works offline

Every screen reads from IndexedDB on the device, never from the network, and a sync engine
pushes and pulls in the background. Log a whole session in airplane mode; it reaches the server
when signal comes back, exactly once. How that holds together — the outbox, last-write-wins per
row, deterministic ids, parents-first applies — is in
[`docs/architecture.md`](docs/architecture.md).

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind v4 + shadcn/ui · Drizzle + Turso (libSQL) ·
NextAuth v5 · Dexie · Vitest · Vercel

## Getting started

The env files are committed encrypted with git-crypt. Unlock once per clone with the shared key
from 1Password — never `git-crypt init`:

```bash
git-crypt unlock ~/Downloads/git-crypt-key && rm ~/Downloads/git-crypt-key
npm install
npm run db:migrate     # local SQLite at ./local.db
npm run db:seed        # the exercise library
npm run dev            # http://localhost:3000
```

## Scripts

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Lint, typecheck, then `next build` — what CI and Vercel run |
| `npm run db:generate` | New migration from `db/schema.ts` |
| `npm run db:migrate` / `db:migrate:prod` | Apply migrations to local / production |
| `npm run db:seed` / `db:seed:prod` | Load the exercise library |
| `npm run exercises:import` | Re-import the library from free-exercise-db |
| `npm run user:role -- <email> admin` / `user:role:prod` | Grant (or with `user`, revoke) access to `/admin` |

## Testing offline

Use a production build — under `next dev` the service worker serves stale hot-reload chunks and
misleads you either way:

```bash
npm run build && npx next start -p 3001
```

Then turn the network off in DevTools. On a phone, test against the deployed site: service
workers and the screen wake lock only run over HTTPS.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — sync protocol and the offline design
- [`docs/design-system.md`](docs/design-system.md) — the plate-colour palette and type
- [`docs/env.md`](docs/env.md) — environment variables and git-crypt
- [`docs/plan.md`](docs/plan.md) — the build plan and what is still to do
- [`CHANGELOG.md`](CHANGELOG.md)

## Credits

Exercise data and photos: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db),
released into the public domain under the Unlicense.
