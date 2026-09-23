# gymlog — workout editor + gym logger

## Context

Ivan trains 3x/week as a beginner and the app his gym provides is bad. He wants his own: build
reusable **workout templates** (exercise, sets, reps, rest), assign them to days of the week
according to his current **development stage** (Beginner 3-day: Mon/Wed/Fri), then at the gym open
today's session and log the **weight and reps he actually did**, set by set. Plus a **library of
exercises with pictures/simple animations** so he knows what a movement looks like.

Confirmed with Ivan: **Next.js PWA on Vercel + Turso**, **multi-user from day one**,
**offline-first is a hard requirement** (gym basements have no signal — this is the #1 reason gym
apps suck), v1 includes the weekly program, the exercise library and **bodyweight tracking**,
exercise media comes from the public-domain **free-exercise-db** cross-fade, repo is
**`~/code/gymlog`** (greenfield, nothing exists yet).

### Multi-tenant from day zero — a standing constraint, not a phase

Ivan is the only user today, but if it works for him it goes to other people. Nothing in the build
may assume a single tenant, and nothing may need a migration to open up later:

- **Every user-owned row carries `userId`, and every read filters on it.** No exceptions, no
  "we'll add it later" tables. `userId` on writes is always taken from the JWT server-side and
  never from the request payload.
- **Real signup/login from Phase 0** — email + bcrypt password, not a hardcoded account or an
  `ADMIN_PASSWORD` env var. No "Ivan" anywhere in the code or the seed data.
- **The seed exercise library is global and shared** (`exercises.userId IS NULL`, read-only);
  user-created exercises hang off the same table with a non-null `userId`. One query path.
- **Sync is already per-user** — the `rev` cursor lives on `users.syncRev`, so two people syncing
  concurrently never see each other's rows.
- **Local device storage is namespaced by user id** (Dexie DB name), and logout wipes it — a shared
  phone must not leak one person's log into another's.
- Sharing a *program* or *template* with someone else is explicitly **not** in v1 (YAGNI), but the
  schema doesn't block it: a template is already an owned row that could gain a `sourceTemplateId`
  copy-from later.

---

## Stack

House conventions, confirmed against `devilwatchdog` / `theflyingdevil`:

| Layer | Choice | Copy from |
|---|---|---|
| Framework | Next.js 16 App Router, TS `strict` + `noUncheckedIndexedAccess` | `devilwatchdog/tsconfig.json` |
| Styling | Tailwind v4 (CSS-first) + shadcn/ui (`neutral`, lucide, cssVariables) | `devilwatchdog/components.json` |
| DB | **Drizzle + Turso (libSQL)**, lazy `Proxy` client | `devilwatchdog/db/index.ts`, `drizzle.config.ts` |
| Env | Zod `lib/env.ts` + `lib/env.public.ts` two-file split | `theflyingdevil/lib/env.ts` |
| Auth | NextAuth v5 credentials + bcrypt, **JWT strategy → no adapter tables** | `devilwatchdog/{lib/auth.ts,auth.config.ts,middleware.ts}` |
| Offline | **Dexie (IndexedDB)** + outbox + hand-rolled `public/sw.js` | no prior art on this machine |
| Tests | Vitest on sync/merge/queries; Playwright on the log-a-set flow only | `lanzarotenomad-v2/vitest.config.ts` |
| Deploy | Vercel, `.vercelignore` env block, 7-char SHA footer | `theflyingdevil/{.vercelignore,components/footer.tsx:104}` |

The service worker is ~80 lines written by hand rather than `next-pwa`/Serwist — runtime caching
only, nothing to fight with Turbopack. (Workbox stays the fallback if hand-rolling gets hairy.)

---

## The one architectural decision that matters

**The client reads from IndexedDB, always — never from the network.**

Every screen renders off Dexie via `useLiveQuery`; a background sync engine is the only thing that
talks to `/api/sync`. Decided on day one, not retrofitted — bolting offline onto components that
`await fetch()` is a rewrite of every screen. Consequences: no spinners, no `isOnline` branches, no
network call anywhere on the logging path, and "what did I lift last time?" answers instantly in a
basement. The log screen must be a client component; it must not sit behind a server-component fetch.

---

## Data model (`db/schema.ts`)

Text ids, integer epoch-ms timestamps. Every synced table carries
`createdAt, updatedAt, deletedAt, rev`.

```
users            id, email, passwordHash, name, unit('kg'|'lb'), syncRev, createdAt
exercises        id, userId (NULL = global seed library), name, slug, primaryMuscle,
                 secondaryMuscles, equipment, level, instructions[], images[], cues
exerciseNotes    id, userId, exerciseId, notes (your cues), favoritedAt (NULL = not starred)
                 UNIQUE(userId, exerciseId)
workoutTemplates id, userId, name ("Workout A: Full Body"), notes
templateItems    id, userId, templateId, exerciseId, position, sets, targetReps,
                 targetRepsMax, targetWeightKg, restSec, notes
programs         id, userId, name ("Beginner 3-day"), stage, startedOn, endedOn (NULL = active)
programDays      id, userId, programId, dayOfWeek(0-6), templateId   UNIQUE(programId,dayOfWeek)
sessions         id, userId, programId?, templateId?, templateName (SNAPSHOT),
                 scheduledFor ('YYYY-MM-DD'), startedAt, completedAt, notes
setLogs          id, userId, sessionId, exerciseId, exerciseName (SNAPSHOT), position, setIndex,
                 targetReps/targetRepsMax/targetWeightKg/restSec (SNAPSHOT of the prescription),
                 weightKg, reps, isWarmup, completedAt, performedAt, notes
                 UNIQUE(sessionId, exerciseId, setIndex)
                 INDEX (userId, exerciseId, performedAt)
bodyWeights      id, userId, measuredOn ('YYYY-MM-DD'), weightKg, notes
                 UNIQUE(userId, measuredOn)
```

Decisions worth stating:

- **Copy-on-perform snapshots.** `setLogs` stores both what you were *told* to do and what you
  *did*. Editing or deleting a template next month cannot rewrite what January says — which is why
  no event sourcing is needed. `templateId`/`programId` on a session are nullable `SET NULL`
  provenance links, never the source of truth for rendering history.
- **Development stage = a `program` with `startedOn`/`endedOn`.** Progressing is "end one, start
  another". Old sessions keep their history and don't depend on the old program surviving.
- **Schedule is one row per (program, day-of-week).** No rrule, no generated calendar rows.
  Sessions are materialised lazily — "today's workout" is derived from the active program, and a
  `sessions` row appears only when he taps Start.
- **`scheduledFor` is `TEXT 'YYYY-MM-DD'`**, everything else epoch ms — the calendar date of a
  workout is a local fact, and a timestamp makes "today" wrong the moment he travels.
- **`weightKg REAL` is canonical**, `users.unit` is display only. Never store mixed units.
- **`performedAt` is denormalised onto `setLogs`** (from the session date) because IndexedDB has no
  joins: the "last time" query must be one index range scan on both sides.
- **Nothing is hard-deleted** — `deletedAt` tombstones, because an offline device has to learn
  about a deletion, and hard deletes are invisible to a delta pull.
- **Bodyweight is one row per day** (`UNIQUE(userId, measuredOn)`), which makes the id
  deterministic (UUIDv5 of `userId|measuredOn`) like sessions: weigh in on the phone and re-enter
  it on the laptop and you get one corrected row, not two. Same `weightKg` canonical unit as the
  lifts, same `users.unit` for display.

## IDs — client-minted, and deterministic where there's a natural key

A set logged in the basement needs its final primary key immediately, so no id-remapping pass ever
runs. **UUIDv7** (`uuidv7`, ~1 kB, in `lib/id.ts`) rather than `crypto.randomUUID()`'s v4: the
leading timestamp makes ids k-sortable, so SQLite appends instead of splitting pages at random, and
`ORDER BY id` is free FIFO order for the outbox.

**Exception — `sessions`, `setLogs` and `bodyWeights` use deterministic UUIDv5** over their natural
keys (`userId|date|templateId`, `sessionId|exerciseId|setIndex`, `userId|measuredOn`). Two devices that start the same
day's workout independently compute the *same* id, so sync upserts merge instead of duplicating,
and the `UNIQUE(sessionId, exerciseId, setIndex)` index can never be violated.

## Sync

- **One endpoint, one round trip.** `POST /api/sync` with `{ cursor, clientId, mutations[] }` →
  `{ cursor, serverTime, changes, applied, rejected }`. Push and pull in a single SQLite
  transaction; `cursor: 0` is the bootstrap snapshot, so there is no second endpoint. `userId` is
  always forced from the JWT, never trusted from the payload.
- **Delta pull is `rev > cursor`**, where `rev` is a server-stamped monotonic counter per user
  (`users.syncRev`) — immune to clock skew, unlike `updatedAt > lastPulledAt`.
- **Outbox**: append-only full-row upserts (no field diffs, no OT). Each local write is one Dexie
  transaction that writes the row *and* appends the mutation; on flush, coalesce to the last
  mutation per `[table+rowId]`. A delete is an upsert with `deletedAt` set.
- **Conflict resolution: last-write-wins per row on `updatedAt`**, ties broken by lexicographically
  larger `clientId`. This is only acceptable because **the conflict grain is one set, not one
  workout**: phone logs bench set 3 while laptop fixes squat set 1 — different rows, both apply,
  nothing lost. Only editing the *same set* on two devices drops anything, and then the later
  correction wins, which is the right answer. Losers come back in `rejected[]` → a quiet "1 change
  was overwritten by another device" toast. No merge UI, no CRDTs.
- **Clock offset**: the response carries `serverTime`; store `clockOffset` in `meta` and stamp every
  `updatedAt` as `Date.now() + clockOffset`. Ten lines that kill an entire class of silent bug (a
  phone four minutes fast otherwise wins every conflict forever).
- Flush on: app focus, `online`, `visibilitychange`, after each set log, and a 30s timer while online.
- Dexie mirrors the server tables plus local-only `outbox` and `meta`. Scope: full exercise library,
  all templates/programs, sessions+setLogs for the last 180 days.
- Call `navigator.storage.persist()` at login — iOS Safari evicts IndexedDB from low-engagement
  sites, and it would take an unsynced outbox with it.

## "Last time you lifted X" — the highest-value feature

Runs **from IndexedDB** (`[exerciseId+performedAt]` compound index, reversed, filtered to
non-warmup completed sets): it's the number he reads standing at the bar with no signal. The
identical `performedAt` denormalisation gives the server the same two cheap indexed queries for the
laptop dashboard. Each new set's weight input is prefilled with last session's weight for the same
`setIndex` — that alone is most of the app's value. Also cheap from the same rows: top set and
Epley e1RM for the progression chart.

---

## Exercise library — data + media

**Source: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db)** — 876
exercises, **Unlicense (public domain)**, updated this week, 1.9k stars. Fields: `name, force,
level, mechanic, equipment, primaryMuscles, secondaryMuscles, instructions[], category, images[]`,
with **exactly two photos per exercise: the start and end position**.

**Those two frames are the animation** — cross-fade `0` ↔ `1` on a ~1.2s loop and it reads as the
movement being performed. One CSS keyframe animation, no GIF, no video, no licensing question,
and it degrades to a still under `prefers-reduced-motion`.

*(Rejected: `hasaneyldrm/exercises-dataset`, 1,324 true GIFs — the media is © Gym Visual, licensed
to that repo and not transferable. Swap-in remains possible if Ivan ever buys a licence.)*

**Import pipeline** — `scripts/import-exercises.ts`, run once, output committed:

1. Fetch `dist/exercises.json`.
2. Filter through **`data/exercise-filter.json`** (config, not code, per house rules): levels
   every level, equipment and category → **873 exercises**, the last 14 of them cardio machines
   (Stairmaster, bikes, treadmill, rower), logged as time instead of weight × reps. (The first cut kept
   438 — beginner+intermediate strength and stretching on five equipment types — and lost gym
   staples filed under `other` or `expert`, like hyperextensions, dips and hanging leg raises.)
3. Download both images, convert to WebP @600px with `sharp` → `public/exercise-media/<id>/{0,1}.webp`
   (~39 MB, one-time commit — no CDN dependency, so the library works offline).
4. Append `data/exercise-extras.json` — movements the source lacks (a two-hand kettlebell swing),
   written by hand, no photos — and emit `db/seed-exercises.json` for `db/seed.ts`. A test fails
   if the extras file changes without a re-import.

---

## Screens

| Route | What it does |
|---|---|
| `/` | **Today** — today's workout from the active program, each exercise with its sets and reps and what you lifted there last time (`planPreview()` in `lib/queries.ts`), under a count and a rough length from sets × rest (`lib/plan.ts`); big Start button; or "rest day" + start anything. A week strip under the header (`components/week-strip.tsx`, `planWeek()` in `lib/week.ts`) marks each day done, missed, planned or a rest day, each square wearing its workout's letter — the same A, B, C Plan gives it (`workoutLetters()`) — and a workout that went by untrained is offered to do today — unless it was trained on another day of the week, or is what the programme has you doing today anyway. An account with no workouts and nothing logged (`isNewAccount()` in `lib/history.ts`) gets a welcome and the two ways to a plan instead — a premade programme or build your own — shown only once a first sync has confirmed the account really is empty. Once a set is logged today it becomes today's log, each session tagged with the body parts it worked; the workout planned for today and the one missed earlier in the week are no longer pushed as cards but fold under "Start another workout", marked Planned for / Missed on, and a finished session shows its totals with the sets behind a toggle (`bodyParts()` in `lib/body-parts.ts` folds the library's muscles into Legs, Chest, Back, Shoulders, Arms, Abs, Cardio). Shows last-sync time, red banner if the outbox is non-empty or sync is >24h stale ("Ready for the gym" check). |
| `/session?id=…` | **The gym screen.** One exercise at a time, huge tap targets, set rows pre-created from the prescription and prefilled from last time, ✓ completes a set and auto-starts the rest timer. Cardio (`category = 'cardio'`) logs minutes instead: `set_logs.duration_sec`, prescribed by `template_items.target_duration_sec`. *Add exercise* appends one to the session under way — a warm-up that is not in the workout. Screen wake-lock on. |
| `/workouts`, `/workouts/[id]` | **Plan** — the week along the top, a cell per day wearing the letter of its workout (tap to pick from a sheet, `components/day-picker.tsx`; `assignDay()` in `lib/program.ts`), then the workouts wearing the same letters — each row shows its scheduled days, when it was last done and the body parts it covers, opens the editor, and has its own Start — then *Browse premade programmes* and *Start a new stage*. `/program` redirects here. Editor: add exercises, drag to reorder, target sets/reps/rest; removing an exercise is one tap with a six-second *Undo* bar above the tabs (`restoreTemplateItem()`) |
| `/exercises`, `/exercises/[id]`, `/exercises/new` | Library ordered favourites first, then what the active programme has you doing, then what you have logged most recently, then the rest by name (`exerciseRank()` in `lib/queries.ts`, applied in `filterExercises`), with a search that matches every word in any order, quick chips (favourites, what your equipment allows, body part — Legs, Chest, Back…, and the unnarrowed grid is sectioned by them, your own exercises first) and a Filters panel (equipment, type, level, compound or isolation, push or pull; several values in a group match any), and a star to favourite a movement — the workout editor's exercise picker uses the same filters (`components/exercise-filters.tsx`); the exercise page's *Do this now* logs it today without touching the programme (`doExerciseToday()`: the session open today, else that day's *Extra* session, which belongs to no workout); detail shows the cross-fade, instructions, your own cues, and your history for that lift. *Add your own* (and the empty search result) opens `/exercises/new`: a name, what it needs, what it mostly works and its type make a row of yours in the same table (`createExercise()` in `lib/exercises.ts`), listed under *Yours* with its initial for a photo; its own page can delete it, a tombstone that keeps the sets logged against it |
| `/history` | **Progress** — this week's days done over planned and kilos moved, the main lifts' top set and e1RM over time (`lib/progress.ts`, `components/strength-chart.tsx`), records, the week streak and calendar, then past sessions |
| `/weight` | Bodyweight log — one tap to enter today's weight, editable history, trend line with a 7-day rolling average (daily weight is noisy; the average is the signal) |

The bottom nav has five tabs: Today, Plan, Progress, Exercises, Profile. **Plan** is `/workouts` —
one screen for "what I train and when" — with `/programmes` a step behind it.

Rest timer counts down from a timestamp stored in IndexedDB `meta` (`lib/rest.ts`) — it survives
backgrounding, a reload and leaving the screen, where it shows above the tabs — and vibrates and
beeps at zero. The `frontend-design` skill drives the visual direction — dark, high-contrast,
thumb-reachable; this gets used one-handed with chalky hands, which is a real design constraint.

---

## Build order

Each phase ends in a working app and one commit.

0. ~~**Scaffold** — Next 16 + Tailwind v4 + shadcn, `lib/env.ts`/`env.public.ts`, Drizzle+Turso,
   NextAuth credentials + `proxy.ts` (Next 16 renamed `middleware.ts`), `.vercelignore`, SHA
   footer, `CLAUDE.md`, `docs/{architecture,design-system,env}.md`, `CHANGELOG.md`.~~ ✅
   - ~~Deploy to Vercel~~ ✅ — https://gymlog-pi-eosin.vercel.app, Turso in `aws-eu-west-1`.
   - ~~Unit tests in GitHub Actions, gating on the production deploy, with a README badge~~ ✅
1. ~~**Exercise library** — import script, seed, `lib/db/dexie.ts` + `lib/sync/client.ts` +
   `app/api/sync/route.ts`, `/exercises` with the cross-fade.~~ ✅
2. ~~**Templates + program + bodyweight** — `/workouts` editor, `/program` weekly grid, `/weight`.~~ ✅
3. ~~**The gym screen** — set logging, rest timer, wake lock. The core loop.~~ ✅
   Lives at `/session?id=…` rather than `/session/[id]` — see `docs/architecture.md`, "Working
   offline".
4. **PWA** — partly done.
   - ~~Manifest, icons, `public/sw.js` (cache-first build assets and `/exercise-media/*`,
     network-only `/api/*`, network-first navigations with an offline fallback).~~ ✅
   - [ ] Install prompt.
   - [ ] "Make available offline" button. The service worker already handles a
     `precache-media` message; nothing in the app sends it yet, so photos are cached only once
     viewed.
5. **Payoff** — partly done.
   - ~~Last-time prefill on the gym screen.~~ ✅
   - ~~Per-exercise cues, and per-exercise history on the exercise page.~~ ✅
   - [ ] `/history` — a list of past sessions.
   - [ ] Per-exercise weight/e1RM progression chart. (`lastPerformance` already computes e1RM;
     only the bodyweight chart exists so far.)

## Verification

- `npm run lint && npm run typecheck` gate `build` (house convention).
- **Vitest** where bugs are silent: LWW merge + tombstones + `rejected[]`, outbox coalescing,
  deterministic-id collision behaviour, clock-offset stamping, "last time I lifted X", and
  today's-workout resolution across a program switch.
- **Playwright**, one flow: start today's session → log 3 sets → reload → data survives.
- **Multi-tenant check, every phase**: create a second account, confirm it sees the shared exercise
  library and *nothing* of the first account's — templates, sessions, weights, sync cursor. A quick
  Vitest that every user-scoped query has a `userId` predicate is worth more than it costs.
- **The real test, by hand**: install on the phone, airplane mode, log a full session, come back
  online, confirm every set landed in Turso exactly once and nothing duplicated. Repeat with the
  same session open on a laptop to watch per-set LWW behave.
- Deployed SHA in the footer confirms which build is live.

## Known sharp edges (and the mitigation already in the design)

1. **No joins in IndexedDB** → the `performedAt` + `exerciseName` denormalisation. Cost: changing a
   session's date must also update its set logs — one `rescheduleSession()` helper, in a single
   transaction, and nowhere else.
2. **Clock skew breaks LWW** → the `clockOffset` stamping above.
3. **Duplicate sessions/sets from two devices** → deterministic UUIDv5 + the unique index. Residual
   edge: if the template is edited between two devices starting the same day, whichever started
   first owns the snapshot; set numbers still merge per set. Acceptable.
