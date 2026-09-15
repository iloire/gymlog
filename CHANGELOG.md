# Changelog

## 2026-09-15 18:16

- Four styles on **Profile → Appearance**, each with a dark and a light version, chosen alongside
  Dark / Light / System and previewed in their own colours and type: **Plate** (the original
  competition-plate look), **Whiteboard** (marker on the box's board, chalk on slate in the dark,
  hand-written figures in Kalam), **Iron** (cast iron, enamel green and safety amber, tall Big
  Shoulders figures, square corners) and **Studio** (indigo and raspberry, Nunito, rounded).
  Saved per device like the theme; the extra faces download only when a style uses them.

## 2026-09-15 17:53

- API access for LLMs (**Profile → API access**, `/profile/api`): create a token, choosing **Read
  only** or **Read and write**, and hand it to ChatGPT, Claude or a script. The token is shown once
  with a ready-to-paste prompt; the list shows each token's access and when it was last used, and
  revoking one takes two taps. Up to 10 at a time.
- `/api/v1`, described at `/api/v1/openapi.json` (import it straight into a custom GPT's Actions).
  Any token reads `/profile` (with the week), `/workouts`, `/exercises` (search), `/history` (every
  trained session with its sets, `from`/`to`/`limit`) and `/bodyweight`. A read and write token can
  also create, replace and delete workouts, set the week (`PUT /programme/week`) and record
  bodyweight; the changes reach your phone on its next sync. Logged sets can't be changed.
- `api_tokens` table (migration `0003_api_tokens`); only a SHA-256 of each token is stored.
- Fixed a latent race: `/api/sync` now reads the sync counter inside its transaction, so a
  concurrent write can no longer reuse a revision and hide a row from another device.

## 2026-09-15 17:28

- History (`/history`, a new tab): every workout you trained, newest first, with its date,
  duration, volume and sets done. Tap one to see each exercise's sets, and **Open to fix a set** to
  correct it on the session screen. Above the list, your workouts are ordered by the one you have
  gone longest without, so in a programme of several workouts the one that is due is on top, with
  Start. Today's "train something anyway" list uses the same order and says when you last did each.
  Works offline.

## 2026-09-15 14:58

- Premade programmes (`/programmes`): Full body 3 days, Upper / lower 4 days and Dumbbells 3 days.
  Tick the equipment you have (presets: Full gym, Home rack, Dumbbells and a bench, No equipment)
  and each programme shows whether it fits, swapping exercises you cannot do for listed
  alternatives — a barbell squat becomes a split squat with dumbbells. The preview shows every
  exercise with its photo; pick which days to train, then **Start this programme** (copies the
  workouts onto your week, ending the current programme) or **Just add the workouts**. Everything
  is copied, so you can edit it freely. A new account's Today screen now offers this first;
  Workouts, Week and Profile link to it. Programmes and equipment are JSON files in `data/`
  (schema in `data/README.md`); your equipment is saved on the device, like the theme.

## 2026-09-15 14:39

- Profile has an Admin link to `/admin`, above Sign out. Everyone sees it; anyone who is not an
  admin gets the usual 404.

## 2026-09-15 14:25

- Fix a mistyped set: the set squares on the session screen are now tappable. Tap any set, logged
  or not, to load its weight and reps into the steppers, then Update set (or Undo this set).
  Before, only the last set of an exercise could be corrected. A correction keeps the set's
  original completion time, starts no rest timer and leaves you on the same exercise; logging
  returns you to the next set still to do.

## 2026-09-15 14:15

- Profile page (`/profile`, new tab in the bottom nav) with your name and email, a theme picker —
  Dark, Light or System — and sign out, which moves here from the Weight page along with the commit
  SHA. The theme is saved per device and applied by an inline script before first paint, so there
  is no dark flash; System follows the OS setting live. Light keeps the plate colours on a chalk
  ground; yellow darkens to ochre so the rest timer stays readable.

## 2026-09-15 14:14

- Session screen: the exercise's photos now head the screen, fading into the page under its name,
  and tapping them opens the exercise's cues and instructions in a dialog. A segment per exercise
  under the header fills as each is finished, last time's sets read as figures, and Previous /
  Next show which exercise they go to.

## 2026-09-15 14:06

- Duplicate workout, in the workout editor: copies the workout and its exercises (sets, reps, rest,
  targets, notes) as "<name> (copy)" and opens the copy. It is written in one Dexie transaction so
  a closed tab cannot leave half a copy, and the copy is not put on the programme.

## 2026-09-15 13:53

- Tapping an exercise in the workout editor opens its details in a dialog (photos, favourite star,
  cues, history, how to do it) instead of navigating to the exercise page, so you close it and keep
  building the workout. The exercise page and the dialog share `components/exercise-detail.tsx`.

## 2026-09-15 13:46

- Sign in and sign up show a picture, picked at random from `data/login-images.json`: across the
  top on a phone with the wordmark on its lower edge, filling the left half on a desk. Three
  drawn stand-ins ship until photos replace them; `docs/login-images.md` has the art direction,
  export spec and generator prompts.
- `/auth-media/` is excluded from the proxy so signed-out visitors can load the pictures.

## 2026-09-15 13:45

- Favourite exercises: a star on each card in the Exercises grid and on the exercise page, and a
  Favourites filter chip on the Exercises page and in the workout editor's exercise picker.
  Favourites sync across devices.
- `exercise_notes.favorited_at` (migration `0002_exercise_favorites`). The star lives on the
  per-user notes row, which already has a deterministic id per (user, exercise), so starring
  offline on two devices merges.

## 2026-09-15 13:28

- Deleting a workout asks for confirmation first, naming the workout and the programme days that
  run it.
- Exercise cards in the workout editor show the exercise's photo (uncropped, 3:2) and link to the
  exercise page.

## 2026-09-15 14:12

- Admin panel at `/admin`: every account with a 12-week training strip, workouts, sets, last
  activity and join date; `/admin/users/[id]` shows one account's programme, workouts, recent
  sessions with their sets and volume, bodyweight and own exercises. Read-only.
- `users.role` (`user` | `admin`, migration `0001_user_role`), checked against the database on
  every admin request; anyone else gets a 404. Sync ignores the role, so an admin uses the app
  exactly like any other account.
- `npm run user:role -- <email> <user|admin>` (and `user:role:prod`) grants or revokes admin.
- The service worker never caches `/admin`.

## 2026-09-15 14:10

- Deployed to Vercel at https://gymlog-pi-eosin.vercel.app on a Turso production database, and
  verified there end to end: signed up, logged a workout offline, reconnected, and every set
  reached production exactly once.
- Fixed: a push containing a row ahead of the row it references (sets before their session, after
  logging offline and then tapping Finish) failed as a whole, stalling that user's sync for good.
  The server now applies parents first and rejects a genuinely orphaned row as `invalid`.
- Fixed: deterministic ids joined their parts with `|`, so different inputs could share an id.
  They now hash a JSON-encoded name. Changed while production held no rows built on them.
- Fixed: the weight on the gym screen was truncated ("77.!") because two steppers shared a phone's
  width; they now stack. The next set prefills from the set you just did, not last week's number.
- Fixed: the first Vercel build failed because typechecking ran before Next generated its route
  types; it only passed locally thanks to a stale `.next` folder.
- 113 unit tests, run by GitHub Actions on every push and pull request. The workflow then waits
  for Vercel's result for the same commit and smoke-tests production, so the README badge is green
  only when tests, build and deploy all succeed.
- README with screenshots and the CI badge.

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
