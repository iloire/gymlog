# Changelog

## 2026-09-15 13:20

- The app works with no signal. Verified on a production build: with the network off, the home
  screen loads, a session opens and sets log; on reconnect every set reached the server exactly
  once, with no duplicates.
- Local-first data layer: Dexie mirror of the server tables, an outbox written in the same
  transaction as each row, and one `/api/sync` endpoint that pushes and pulls in a single round
  trip with per-row last-write-wins.
- Exercise library: 438 public-domain exercises from free-exercise-db, each with start and end
  photos cross-faded into a movement loop, vendored so they work offline.
- Screens: Today, the gym screen (steppers, set squares, rest timer, wake lock, last-time prefill),
  workout editor, weekly programme with stage progression, exercise library and detail, bodyweight
  log with a 7-day average chart.
- Service worker and web app manifest, so the app installs and opens offline.
- Fixed: the outbox kept a copy per edit instead of one per row, so superseded copies were re-sent
  and rejected on every sync and the pending count never cleared.
- Fixed: the app showed nothing offline because NextAuth could not reach its session endpoint; the
  signed-in user id is now remembered on the device and cleared on sign-out.
- Fixed: the home screen briefly said "Rest day" while local data was still loading.
- Sync now distinguishes a `forbidden` rejection (another user's row) from a `stale` one.
- Short commit SHA shown under Sign out on Vercel builds.

## 2026-09-15 11:40

- Scaffold: Next.js 16 (App Router), TypeScript strict, Tailwind v4, shadcn/ui (base-nova, neutral).
- Drizzle + Turso schema for users, exercises, templates, programs, sessions, set logs, bodyweight;
  first migration generated and applied.
- NextAuth v5 credentials auth with JWT sessions; route protection in `proxy.ts` (Next 16 renamed
  `middleware.ts`).
- Zod env modules (`lib/env.ts`, `lib/env.public.ts`), `.vercelignore`, docs and plan.
