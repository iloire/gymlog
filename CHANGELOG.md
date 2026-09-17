# Changelog

## 2026-09-17 22:33

- **Five tabs instead of six.** Workouts, Week and Programmes are one idea — your plan — and now
  share a **Plan** tab, with a Workouts · Week · Programmes switch at the top of each screen. The
  buttons that only linked between them are gone. Tab labels go from 11px to 12px.
- **History is only history.** The "Longest since you did it" list and its blue Start button sat
  above your past workouts and pushed them below the fold. Starting a workout belongs to Today and
  Workouts; past workouts now follow the calendar directly.
- **Workouts rows look tappable and say more.** Each row has a chevron, the days it is scheduled on,
  when you last did it, and a Start button — started on its own scheduled day it counts as the
  programme's session, exactly as from Today.

## 2026-09-17 22:31

- **Reopen a workout finished by accident.** *Finish workout* used to hide itself the moment it was
  tapped; a finished session now offers *Reopen workout* in the same place. It clears the session's
  completion and touches no set, so the workout comes back to Today exactly as it was.
- **Delete a logged workout.** *Delete workout*, with an inline confirm, on the session screen. The
  session and every set in it are soft-deleted in one transaction so the deletion syncs; starting
  that workout again restores it from its tombstone with fresh sets, while an exercise removed from
  a live workout still stays removed.
- **Add exercise moved to Today's session card.** On the one-exercise session screen it read as an
  action on the exercise in front of you. It now sits beside the session's logged sets and
  *Continue*, and drops you on the exercise you picked, ready to log it.
- **Undo this set is gone.** Any set is editable by tapping its square and logging it again, so the
  second button under *Log set* only repeated the same correction.

## 2026-09-16 14:15

- **Remove an exercise from a workout.** The session screen has *Remove exercise* under *Add
  exercise*, with a confirm that warns when sets are already logged. It works on any past workout
  opened from History. The exercise's sets are soft-deleted and synced, so it leaves History and
  "last time"; re-opening the workout does not bring it back, and adding it again starts fresh sets.
- **Fix: `writeRow` could never restore a deleted row.** `deletedAt` was merged with `??`, so an
  explicit `null` fell back to the old tombstone. Only an explicit `deletedAt` now changes it.

## 2026-09-16 12:58

- **Training calendar and week streak on History.** History opens on how many weeks in a row you
  have trained, with a line on what keeps it going, and a month calendar where trained days fill in
  plate blue and a rule lights beside each week that counts. Rest days are never marked as missed,
  and this week only breaks the streak once it is over. Tap a trained day to see its workouts; page
  back through earlier months.

## 2026-09-16 11:34

- **Body-part badges on Workouts.** Each row on the Workouts list shows what the workout covers —
  Legs, Back, Chest, Arms… — weighted by its planned sets, so Upper A and Lower B read apart at a
  glance. Same `bodyParts()` and pills as Today.

## 2026-09-16 11:30

- **No bodyweight box on Today.** The daily weigh-in prompt took space on the screen you open at the
  gym for something logged rarely; it is still one tap away on Profile → Bodyweight.

## 2026-09-16 11:26

- **Body-part badges on Today.** Each session trained today is tagged Legs, Chest, Back, Shoulders,
  Arms, Core or Cardio, most sets first, so you can see at a glance what you worked. The library's
  17 muscles fold into those parts in `lib/body-parts.ts`; exercises without muscles are left out.

## 2026-09-16 10:25

- **Today becomes today's log once you train.** As soon as a set is logged today, the Today screen
  stops offering workouts to start and shows what you have done: each session with its sets,
  kg, cardio minutes and notes, updating as you log, with *Continue* back into one still open. A
  scheduled workout not yet done keeps its own Start button, and *Start another workout* folds
  the rest away. History and Today share one set list.

## 2026-09-16 10:10

- **Do this now** on an exercise's page logs that exercise today without changing your week or
  any workout. It joins the workout you have open today, or else a separate *Extra* session for
  the day, and opens the gym screen on that exercise. The next one you add the same way goes into
  the same session.

## 2026-09-16 09:55

- Installed on the home screen, every screen now starts below the phone's status bar. The gym
  screen's back link and *Exercise 3 of 4* sat under the clock, so there was no visible way back;
  the exercise info dialog's close button could land there too.

## 2026-09-16 09:45

- **A note on an exercise, for that workout.** Under the log button on the gym screen a quiet
  *Add a note* opens a small box for how it went — a grinder of a last rep, a weight close to your
  limit. It shows under that exercise in History and on the exercise page, and the next time you do
  the exercise it appears in quotes under *Last time*. `/api/v1` history returns it as the
  exercise's `notes`.

## 2026-09-16 08:45

- **Cardio, logged as time.** The library gains its 14 cardio machines and moves — Stairmaster,
  Step Mill, treadmill walking, jogging and running, stationary and recumbent bike, elliptical,
  rowing machine, rope jumping and more — and a cardio set records **minutes** instead of weight ×
  reps. In a workout it asks for sets, minutes and rest (10 min by default); on the gym screen it
  shows one *Time* stepper and *Log 8 min*, and last time reads *8 min*. History shows a cardio-only
  session's minutes where volume would be, and each set as *8 min*; the exercise page and the admin
  view do the same. **Add exercise** on the gym screen adds a movement to the session under way —
  the stair machine you warmed up on — without changing the workout. `/api/v1` returns
  `targetDurationSec`, `durationSec`, `cardioMin` and an exercise's `category`, and accepts
  `targetDurationSec` when writing a workout. Migration 0004 adds the three nullable columns.

## 2026-09-16 08:05

- The exercise picker in the workout editor no longer puts its search box under the phone's
  status bar when gymlog is installed on the home screen; it also clears the home indicator.

## 2026-09-16 07:55

- **Weight moves off the bottom bar into Profile.** Seven tabs left each one cramped, and the
  weight log is rarely opened, so it is now *Profile → Bodyweight → Weight log*, with a link back
  to Profile and the Profile tab lit while you are on it. Today's weight is still asked for on
  Today.

## 2026-09-16 07:49

- **More ways to find an exercise.** A *Filters* button on the Exercises page and in the workout
  editor's picker opens equipment, type (strength, stretching, powerlifting…), level, compound or
  isolation, and push or pull. Pick several in a group to match any of them (barbell or
  dumbbells); groups combine. *My equipment* shows only what the equipment chosen on
  Programmes allows. Search matches every word in any order, so "incline press" finds Barbell
  Incline Bench Press, and a count with *Clear filters* shows how many are left. Exercises with no
  equipment in the library now read *Bodyweight* everywhere instead of *Body Only* on some.

## 2026-09-15 20:31

- **Exercise library grows from 438 to 859 exercises.** The import filter kept only beginner and
  intermediate strength and stretching moves on five equipment types, so gym staples were missing:
  hyperextensions, trap bar deadlift, dips, weighted pull-ups, hip thrusts, sumo deadlift, good
  mornings, rack pulls, EZ-bar curls, goblet squats, front squats, hanging leg raises. It now takes
  every level and equipment and every category but cardio. Equipment gains EZ curl bar,
  kettlebells, bands, exercise ball, medicine ball and foam roller (all in *Full gym*); the library
  value `other` names no item. Existing exercises are unchanged.

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
