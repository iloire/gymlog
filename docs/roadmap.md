# Roadmap

What to build next, and why. Written 2026-09-15, after v1 went live at
https://gymlog-pi-eosin.vercel.app. `docs/plan.md` records how v1 was built; this document is
forward-looking.

**Sizes** — **S** under a day · **M** one to three days · **L** more than that.
Every item ships with unit tests; CI requires them.

---

## Recommended order

1. **Train with it once, in a real gym.** Install it from the live URL, do one session, and let
   whatever annoys you with chalk on your hands and no signal jump this queue. An hour at the gym
   is worth more than any line below.
2. **Don't lose unsynced sets on sign-out** (§2.1) — small, and it prevents data loss.
3. ~~**Starter beginner programme** (§1.1)~~ ✅ and **automatic progression** (§1.2) — the part of
   the original brief the app does not do yet.
4. **Exercise instructions offline** (§2.2) and **a rest timer that survives leaving the screen**
   (§2.3).
5. ~~**History**~~ ✅ and **strength charts** (§3.1, §3.2).
6. **Before anyone else signs up** (§5) — password reset, rate limiting, data export.

---

## 1. Coaching a beginner — the unmet half of the brief

The original ask was to train "according to my development stage". Today the app records well but
gives no guidance: a new account opens onto an empty screen and has to design its own programme —
the hardest part for a beginner.

### ~~1.1 One-tap starter programme — M~~ ✅

**Shipped 2026-09-15 as `/programmes`:** three premade programmes (full body 3-day, upper/lower
4-day, dumbbells 3-day) as `data/programmes/*.json`, fitted to the equipment you tick — each
exercise lists alternatives, and the first one you can do is copied in. Start one onto your week
(on the days you choose) or just add its workouts. Schema: `data/README.md`. Still open:

- **A/B alternation across weeks** — the week is fixed per weekday, so A/B/A every week rather than
  A-B-A then B-A-B. Needs a "next workout in order" mode for Today. *Partly there:* History and
  Today's rest-day list order workouts by the one you have gone longest without (`rotation()` in
  `lib/history.ts`), which is that order computed from what you actually did.
- **More programmes and stages**, and a filter on days per week once the catalogue outgrows one
  screen. A file change still needs a deploy: the files are bundled so they work offline.
- **"Only what I have"** on the exercise library and picker, reusing `lib/equipment.ts`.

The original brief:

A "Beginner full body, 3 days" programme to adopt in one tap: Workout A and Workout B alternating
Monday / Wednesday / Friday, with sensible sets, reps, rest and starting weights (empty bar for
barbell lifts).

- **Defined as data, not code** — `data/programmes/*.json` with a schema documented next to it, so
  stages can be tuned or added without a deploy. Adopting one *copies* it into ordinary workouts and
  programme days the user can then edit; later changes to the JSON never rewrite anyone's plan.
- **Stages** — beginner → novice → intermediate, each a file. §1.3 decides when to suggest the next.
- **Already exists:** programmes, programme days, templates, and "Moved up a stage?".
- **Onboarding:** a new account's empty Today screen offers the starter programme first, with
  "build my own" second.

### 1.2 Automatic progression — M

The core mechanic of beginner training is linear progression. The gym screen already prefills from
last time; it should also *suggest the next step* and say why.

- Hit every prescribed rep at a weight last session → suggest **+2.5 kg** on lower-body lifts,
  **+1.25 kg** on upper-body lifts (increment stored per exercise, overridable).
- Missed reps → repeat the weight. Missed at the same weight twice → **deload 10%**.
- Show the reason under the steppers: *"Last time 3×5 at 60 kg, all reps → 62.5 kg"*.
- **Double progression** for rep ranges (8–12): add reps until the top of the range on every set,
  then add weight and reset to the bottom. Needs §4.2.
- **Already exists:** `lastPerformance()` in `lib/queries.ts`, and the prefill order in
  `app/session/page.tsx`. This is pure logic — ideal for exhaustive unit tests.

### 1.3 Suggest moving up a stage — S

When progression stalls across several sessions for most lifts, or a programme has run its
intended weeks, suggest the next stage. A nudge, never an automatic switch.

---

## 2. On the gym floor

Everything here is about the moment of use: one hand, no signal, between sets.

### 2.1 Don't lose unsynced sets on sign-out — S · **data loss**

Signing out deletes the local database (`components/sign-out-button.tsx`) without checking the
outbox. Signing out in a basement after logging a workout destroys every set that has not synced.

- Sync first when online; if changes remain, block sign-out with *"3 changes haven't synced yet"*
  and offer to wait or sign out anyway.
- Test: pending outbox + sign-out → nothing deleted without explicit confirmation.

### 2.2 Exercise instructions offline — S

`/exercises/[id]` is the screen you open at the bar to check a movement, and it only works offline
if it was opened once online — the path segment defeats the service worker's single cached shell.
Move it to `/exercises?id=…` exactly as the session screen was moved (`docs/architecture.md`,
"Working offline"). Same for `/workouts/[id]` (less urgent — edited on the sofa).

### 2.3 A rest timer that survives leaving the screen — S

The timer's end time lives in React state on the session page, so opening an exercise's
instructions mid-rest loses it. Store `restEndsAt` in IndexedDB (`meta`) and render the timer bar
app-wide while it runs. Add **+30 s / skip** buttons.

### 2.4 "Make available offline" — S

The service worker already handles a `precache-media` message; nothing sends it. Send the photo
URLs of every exercise in the active programme after each sync (and on a button), so the whole
programme's photos are on the phone before you leave the house.

### 2.5 Plate calculator — S

Under the weight stepper: the plates to load *per side* for the target weight on a 20 kg bar, drawn
as coloured plates — red 25, blue 20, yellow 15, green 10, white 5, then the change plates. It
matches the design system, whose palette is already the plate code (`docs/design-system.md`).
Handles a 15 kg bar and "not loadable with standard plates".

### 2.6 Warm-up sets — S

Generate warm-ups ahead of the first working set: empty bar × 10, ~50% × 5, ~70% × 3, ~85% × 1,
rounded to loadable plates. `setLogs.isWarmup` exists and is already excluded from "last time" and
progression; nothing in the UI sets it yet.

### 2.7 Install prompt — S

Android: capture `beforeinstallprompt` and offer "Add to home screen" after the first completed
session. iOS: a one-time illustrated hint (Share → Add to Home Screen), since Safari has no prompt.

### 2.8 kg / lb — S

`users.unit` exists and is display-only by design (everything is stored in kg), but there is no
setting for it and the UI always says kg. Add the toggle, convert at the edges, and make the
stepper increment 5 lb in lb mode.

---

## 3. Seeing progress

### ~~3.1 History — M~~ ✅

**Shipped 2026-09-15 as `/history`:** past sessions newest first (date, workout, duration, volume,
sets done), each expanding to its sets with a link back into the session screen to fix one. Above
it, your workouts ordered by the one you have gone longest without, each with Start. Still open: a
proper read-only view and rescheduling a session to another date.

The original brief: a list of past sessions (date, workout, duration, volume), each opening a read-only view with an
**Edit** mode for correcting a mistyped set. Rescheduling a session must go through
`rescheduleSession()` so `performedAt` stays consistent.

### 3.2 Strength charts — M

Per exercise: top-set weight and estimated 1RM over time, the same inline-SVG approach as the
bodyweight chart. `lastPerformance()` already computes Epley e1RM. Optionally overlay bodyweight to
show relative strength.

### 3.3 Personal records — S

Detect and mark a heaviest weight, best e1RM, or most reps at a weight — using the plate red
reserved for "you beat last time". Today the gym screen only compares against the *previous*
session's top set.

### 3.4 Weekly summary — S

Sessions done versus planned this week, total volume, and a gentle streak — encouraging, never
guilt-tripping. The admin panel's 12-week training strip (`lib/admin.ts`) is a ready starting
point for a personal version.

~~The streak~~ ✅ — History opens on a week streak and a month calendar (`lib/calendar.ts`,
`components/training-calendar.tsx`). Weeks count, not days, so a rest day never breaks it. Still to
do: sessions done versus planned, and weekly volume.

### 3.5 Notes and effort — S

Per-session and per-set notes (the `notes` columns exist; no UI writes them), and an optional
**RPE** per set — a new column, and a better progression signal than reps alone once past the
beginner stage.

---

## 4. Richer programmes

### 4.1 Custom exercises — M

The schema supports a user's own exercises (`exercises.userId` non-null) and sync already refuses
writes to the global library, but there is no UI to create one. Name, equipment, muscles,
optional photo (Vercel Blob or Supabase Storage), and cues.

### 4.2 Rep ranges in the editor — S

`templateItems.targetRepsMax` exists; the workout editor only sets a single rep target. Add
"8–12"-style ranges. Prerequisite for double progression (§1.2).

### 4.3 Supersets and circuits — M

Group consecutive exercises so the gym screen alternates between them and starts the rest timer
only after the group. Needs a `groupId` on template items and set logs.

### 4.4 Time and distance exercises — M

Planks, carries, cardio. The model is weight × reps only. Add a measurement type per exercise
(reps / time / distance) and a matching stepper.

### 4.5 Swap an exercise mid-session — S

The squat rack is taken: swap to an alternative sharing the primary muscle and equipment the gym
has, for this session only. Favourites (already built) rank the suggestions.

---

## 5. Before anyone else signs up

Multi-user has been a constraint since day zero, but a few things must exist before a stranger
creates an account.

### 5.1 Password reset and email verification — M

There is no way to recover a forgotten password. Needs an email provider (Resend fits the stack)
and a signed, expiring token table. Verify the address at signup.

### 5.2 Rate limiting on login and signup — S

Neither route is rate limited today. Upstash Redis (the house choice alongside Vercel), keyed by IP
and by email.

### 5.3 Export and delete my data — S

Download the whole log as JSON and CSV; delete the account and every row it owns. Trust, and the
right thing to offer.

### 5.4 Sign in with Google — S

Fewer passwords for other people to forget. Auth.js supports it alongside credentials; accounts
link by verified email.

### 5.5 Share a programme — M

Send someone a link that copies your workouts and week into their account. A copy with a
`sourceTemplateId`, never a live link, so nobody's history can change under them (the plan
anticipated this).

### 5.6 Coach view — L

A coach sees an athlete's log read-only and suggests edits. The admin panel's per-account view is
the technical starting point; the hard parts are consent, invites and revocation.

---

## 6. Engineering and operations

### 6.1 Surface sync problems to the user — S

The server now rejects a row it cannot store as `invalid`, and the client drops every rejection
from the outbox — silently. The plan's promised *"1 change was overwritten by another device"*
toast was never built, and an `invalid` rejection leaves a local row that will never sync with no
sign of it. Show both; keep invalid rows visible until resolved.

### 6.2 Error monitoring — S

Server sync failures only reach `console.error` in Vercel logs. Add Sentry (or Vercel's
monitoring) on both the API routes and the client sync loop.

### 6.3 Automate the offline test in CI — M

The airplane-mode test that proved offline works was run by hand. Playwright can do it: production
build, log in, `context.setOffline(true)`, log sets, reconnect, assert the server received each
set exactly once. The single most valuable end-to-end test this app could have.

### 6.4 Bound the first sync — M

A bootstrap pull (`cursor: 0`) returns the user's entire history in one response. Fine at a few
hundred sets; slow after two years of training on a phone in a basement. Page the pull, and keep
only the last ~180 days of sets on the device as the plan intended (older history on demand).

### 6.5 Service worker updates — S

The cache version is a constant bumped by hand (`VERSION = 'v1'` in `public/sw.js`), and a new
deploy only reaches an open app on its next full load. Derive the version from the commit SHA at
build time and show *"A new version is ready — reload"*. Never reload mid-set.

### 6.6 A Dexie migration discipline — S

The local database is at `version(1)`. The first change to any IndexedDB store after real users
exist needs `version(2)` with an upgrade function, or their browsers keep the old shape. Write it
down (and test an upgrade from v1 data) before the first such change, not during it.

### 6.7 Database backups — S

Confirm what Turso's plan retains for point-in-time restore, and add the house `db:backup` /
`db:backup:prod` scripts (a periodic dump to the NAS rides the existing restic backup).

### 6.8 Preview deployments — S

Vercel only has Production environment variables, so any branch preview build fails env
validation. Add Preview variables pointing at a separate Turso database — never production.

### 6.9 Dependency hygiene — S

A moderate esbuild advisory arrives through `drizzle-kit` (development only). Track it rather than
force-downgrading; add Dependabot for npm and GitHub Actions.

---

## Parked ideas

Worth remembering, not worth building yet:

- **Apple Health / Google Fit** — write workouts and bodyweight out. Native-only APIs; would need a
  wrapper app.
- **Gym equipment profile** — tell the app what your gym has (no leg press, plates to 1.25 kg) so
  substitutions (§4.5) and the plate calculator (§2.5) respect it. *Half done:* the equipment you
  tick (`lib/equipment.ts`) already fits premade programmes; plates are not modelled.
- **Voice logging** — "sixty kilos, five reps" with sweaty hands. Browser speech recognition does
  not work offline.
- **Watch complication** for the rest timer.
