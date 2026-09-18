# Changelog

## 2026-09-18 02:30

- **The steppers open on the next step, not on a repeat.** `lib/progression.ts` works out what
  to try from the last two times you did the exercise: every prescribed rep hit → one increment
  up (2.5 kg on a barbell, 5 on a barbell leg lift, 2 on dumbbells, 5 on a stack; a rep on a
  bodyweight movement), reps missed → the same weight, missed twice at that weight → 10% off,
  rounded to a loadable weight; a rep range climbs its reps first. The reason sits in one line
  under the steppers until you change the numbers, red-edged when it is heavier than last time,
  and the button says what it will log: "Log set 3 · 77.5 kg × 10". Increments follow the
  equipment (`lib/weights.ts`); `recentPerformances()` in `lib/queries.ts` returns the sessions
  before last as well.

## 2026-09-18 02:15

- **Last time is a row of squares, not a sentence.** "Last time 75×10, 75×10, 75×8" made you parse
  text and count. The session screen now draws last time's sets as a dimmed, dashed row above
  today's squares, aligned by set number, so "set 3 was 8 reps" is read down a column, and the
  red edge on a square below explains itself. The row is labelled with how long ago it was.

## 2026-09-18 02:05

- **Rest takes the screen.** While the rest runs, the block where the steppers were becomes the
  clock, set huge and draining, with the next set's numbers under it and Skip rest where Log set
  was (`RestTakeover` in `components/rest-timer.tsx`). At zero the steppers return. Tapping a done
  square to fix it mid-rest brings the steppers back with the bar at the bottom. One `useRest()`
  hook per screen owns the beep, so two views can never both fire it.

## 2026-09-18 00:45

- **Profile is a list of rows again.** The four style tiles and the equipment chips sat inline
  and took the whole first screen, so Bodyweight, Your data and API access were below the fold.
  Appearance and Equipment now open their own pages (`/profile/appearance`,
  `/profile/equipment`) from a row on Profile, the way Bodyweight and Your data already did.

## 2026-09-18 00:40

- **Every screen loads the same way.** Today drew its header with a pulsing bar where the
  workout's name would go; the session, history, week, programmes, workout editor, exercise
  detail and workout summary printed "Loading…" in the corner and then jumped to the real page,
  and the workouts list opened on "No workouts yet" for a frame. Each now renders its frame —
  tabs, back link, a fixed heading — with a placeholder the size of what it is waiting for
  (`Loading`, `Placeholder` in `components/loading.tsx`), so the page keeps its shape.

## 2026-09-18 00:34

- **The library opens with your exercises, not 3/4 Sit-Up.** Favourites come first, then the
  exercises in the workouts your programme schedules, then anything you have logged with the most
  recent first, then the other movements by name. The picker in the workout editor uses the same
  order (`exerciseRank()` in `lib/queries.ts`, `filterExercises` in
  `components/exercise-filters.tsx`).

## 2026-09-18 00:30

- **"Synced just now" is gone from Today.** It took a row on every load to say nothing was
  wrong. The sync line now shows nothing when all is well; the yellow bar still appears when
  changes are waiting, the phone is offline or the copy of the plan is over a day old
  (`components/sync-badge.tsx`).

## 2026-09-18 00:26

- **Remove exercise moves behind a ⋮ beside the exercise name.** It was a full-width button
  under Next — the one action you never want mid-set, in the thumb's path — and its height was
  what pushed Log set onto the bottom edge of a 320 × 568 phone. It is now an item in a small
  overflow menu next to the name (`components/overflow-menu.tsx`), and the confirm is a modal
  (`components/remove-exercise.tsx`) rather than a panel in the page. Swap exercise (roadmap §4.5)
  joins the menu when it lands.

## 2026-09-18 00:21

- **The rest bar has +30 s and Skip, and the last set starts none.** The timer ran on after the
  final set of the workout with nothing to rest for and no way to stop it. `startRest()`
  (`lib/rest.ts`) now looks at what is left in the session and starts nothing once every set is
  logged — *Finish workout* is what the screen shows at that point — and the bar itself carries
  *+30 s* and *Skip* beside the clock, on every screen it appears on. Thirty seconds more also
  widens what the bar counts as full, so it keeps draining rather than sitting past its edge; a
  skip clears the rest without the beep. Off the session screen the label, now *Back to workout*,
  is the link; the buttons sit beside it.

## 2026-09-17 23:55

- **Export and import your data.** *Profile → Your data* (`/profile/data`) writes the whole account
  out as one JSON file — every workout, programme, logged session, set and weigh-in — and reads one
  back. Both run against IndexedDB (`lib/backup.ts`), so they work with no signal, and an import
  goes to the server through the outbox like any other write. The file leaves out the shared
  exercise library (every account has it, and writing it back would be `forbidden`) and tombstones,
  but includes exercises you added yourself. Picking a file shows what is in it before anything is
  written.

  Your own backup keeps its ids, so a restore is exact and importing it twice changes nothing the
  second time. A backup from *another* account cannot: those ids belong to someone else on the
  server, which would reject every row and leave it stranded on the device. Each row gets an id
  derived from (your account, its old id) — `importedId()` in `lib/id.ts` — with every reference
  between them remapped to match, still deterministic so a second import lands on the same rows.
  A weigh-in and an exercise note take their natural-key id instead, because the unique index on
  (user, day) and (user, exercise) would otherwise refuse them, and an imported exercise whose slug
  is already here is dropped in favour of the one you have. A row whose parent is missing is left
  out rather than written as something the server will reject; a missing exercise never drops a row,
  since the library has not synced yet on a phone you have just restored onto.

- **A sync push now stops at the 2000 rows the server accepts** (`MAX_PUSH`, shared by
  `lib/sync/client.ts` and `/api/sync`). An import can queue thousands at once, and the whole batch
  was being sent, refused as a bad request, and sent again forever — sync could never drain.

## 2026-09-17 23:46

- **A workout now ends on something.** Finishing one used to drop you back on Today with nothing
  to show for it. *Finish workout* now hands the screen to a summary
  (`components/workout-summary.tsx`): the kilos you moved set at the largest size on the screen,
  the sets and the time it took, then everything that beat last time — `+5 kg`, `+2.5 kg`,
  `+1 rep`, each with the set that did it and the set it beat — then the week streak and the whole
  log. Exercises done for the first time are named as the numbers to beat. It reads Dexie like
  every other screen, so it works in a basement, and *Back to today* or *Reopen workout* are the
  two ways off it.
- **What counts as beating last time lives in one file.** `lib/records.ts` compares an exercise
  against its last outing on four axes — a heavier top set, more reps at that same weight, a
  longer time, more total work — and says only the biggest one, so the red list stays honest. A
  lighter day that did more total work still counts; a lighter day that did less says nothing.
- **A set gone heavier keeps a red edge.** The set square of a set logged above last time's best
  holds a red edge for the rest of the workout, and the *Heavier than last time* line under the
  steppers now goes as soon as one of that exercise's sets banks it. The line was a nudge before
  the lift; the square is what still says so four exercises later. Both ask the same
  `heavierThanLastTime()`, so they cannot disagree.

## 2026-09-17 23:32

- **Today says what the workout actually is, and what you missed.** The planned workout listed
  exercise names and nothing else, so the only way to know what you were walking into was to open
  the workout. Each line now carries its target and your last number — `3×5 · last 60 kg`, a rep
  range as `3×8–12`, a timed set as `10 min` — under a heading that counts the exercises and
  estimates the length from sets × rest (`lib/plan.ts`, `planPreview()` in `lib/queries.ts`).
- **A week strip under the header.** M T W T F S S, each day filled blue for trained, grey for a
  planned day that went by empty, outlined for one still to come and a dot for a rest day, with
  today ringed (`components/week-strip.tsx`, `planWeek()` in `lib/week.ts`). It makes a missed day
  visible instead of silent: a rest day that used to say only "Rest day" now leads with the
  workout you skipped — "You missed Wednesday's Full body B — do it today?" — in full, ready to
  start, and a day that already has a workout on it offers the same thing as a note underneath.
  A workout trained on another day of the week is not missed, and neither is one the programme
  has you doing today anyway: both would open the very same session.

||||||| parent of dd2087b (feat: export and import your data - Profile now has a Your data section leading to /profile/data, which writes the whole account out as one JSON file and reads one back. Both run against IndexedDB (lib/backup.ts), so they work with no signal, and an import reaches the server through the outbox like any other write. An export leaves out the shared exercise library, which every account already has and cannot write back, and tombstones, which can only take data away from the account they land in; the exercises you added yourself are in. A file is parsed field by field, so a column this version does not know cannot travel to the server as a row it silently refuses. A backup of your own account keeps its ids: every row lands back on itself, so a restore is exact and importing twice changes nothing the second time. Another account's ids already belong to someone else on the server, which would reject every row and strand it on the device, so each one is remapped through importedId() in lib/id.ts with every reference between them following, deterministically, and a weigh-in and an exercise note take their natural-key id because the unique index on (user, day) and (user, exercise) would otherwise refuse them. An imported exercise whose slug is already here is dropped in favour of the one you have. A row whose parent is in neither the file nor the account is left out rather than written as something the server rejects, but a missing exercise never drops a row - the library has not synced yet on a phone you have just restored onto, and dropping on that basis would throw away every set. A push now stops at the 2000 rows /api/sync accepts (MAX_PUSH, shared by both sides): an import queues thousands at once, and the whole batch was sent, refused as a bad request and sent again forever, so sync could never drain)

## 2026-09-17 23:16

- **One date format across the app.** Week said "since 2026-09-17" and the weight list and chart
  printed raw `YYYY-MM-DD`, while History and the admin screens said "17 Sept 2026" — and an
  exercise's history used the browser's own locale, a third format again. Everything now goes
  through `formatDay`. `epochToDate` in `lib/queries.ts` turns a `performedAt` timestamp back into
  the local calendar date it was logged on first, so the day never slides to the one before east
  of UTC.

## 2026-09-17 23:11

- **Workout editor: removing an exercise can be undone.** The trash icon took the exercise out on
  one tap, with no way back, from a 30px target beside the reorder arrows. It still removes at
  once, but a *Removed … · Undo* bar (`components/undo-toast.tsx`) now sits above the tabs for six
  seconds; Undo puts the exercise back with its sets, reps and rest, through
  `restoreTemplateItem()` in `lib/workouts.ts`. It returns to its old place unless an exercise
  added since has taken that position, and then it goes last, since two items on one position
  cannot be reordered. The arrows and the trash are 44px targets on their own row under the
  fields, arrows on the left and the trash at the far right, which also gives the exercise name
  the card's full width. `Nav` takes `children` for a bar like this one.

## 2026-09-17 23:20

- **Fix: a decimal weight can be typed.** Typing 42.5 into the weight field logged 425: the field
  showed the parsed number on every keystroke, so "42." turned straight back into "42" and the
  point was lost, with a comma keypad too. The field now keeps what you type while it has focus
  (`parseNumber()` in `lib/format.ts` reads "42.5", "42,5" and a half-typed "42."), selects the
  number when you tap it so typing replaces it, and an emptied field keeps the last value rather
  than becoming 0. −/+ are unchanged. The weight log's field uses the same parser.

## 2026-09-17 23:14

- **Profile no longer promises a weigh-in on Today.** The Bodyweight section said "Today's weight
  is asked for on Today", which Today has never done. The paragraph is gone; the section is its
  heading and the *Weight log* button.

## 2026-09-17 23:10

- **Finish a workout you cut short.** *Finish workout* only appeared on the gym screen once every
  set was logged, so skipping the last exercise left the workout open for good. Its card on Today
  now has *Finish workout*, which asks first when sets are left ("Finish with 4 sets not done?")
  and keeps what you logged; *Reopen* undoes it. A workout left open on an earlier day has the
  same button in its opened row in History.

## 2026-09-17 22:53

- **Logging a set no longer needs a scroll.** The session screen opened on a full-width photo that
  took 300px, so weight, reps and *Log set* started below the fold. The photo is now a thumbnail
  beside the exercise name (still tappable for cues and instructions), a long name steps down a
  size instead of wrapping, the steppers carry their label inside the field, and the set squares
  and gaps are tighter. On a 375 × 600 phone the *Log set* button ends at 463px, down from about
  770; it clears the rest bar even with the longest name in the library at 320 × 568.

## 2026-09-17 22:50

- **Fix: the Admin button showed for everyone.** Profile showed it to every account and it led to a
  404 for anyone who is not an admin. Profile now asks the server (`GET /api/admin/me`, the same
  database check `/admin` uses) and shows the link to admins only. Granting or revoking with
  `npm run user:role` shows on the next visit to Profile, with no sign-out.

## 2026-09-17 22:48

- **The rest timer survives leaving the gym screen.** Its end time lived in the session page's
  state, so checking an exercise's instructions or the week mid-rest lost the clock. The rest now
  lives in IndexedDB (`meta`, `lib/rest.ts`) and the bar counts down above the tabs on every
  screen, where tapping it takes you back to the workout. It also survives a reload or the phone
  killing the app. A rest that ran out while the app was closed stays silent, and one whose workout
  was finished or deleted disappears.

||||||| parent of 577f753 (fix: log a set without scrolling - the session screen opened on a full-width 3:2 photo that took 300px, so weight, reps and Log set started below the fold. The photo becomes a tappable thumbnail beside the exercise name, a name over 18 characters steps down a size instead of wrapping past it, Stepper carries its label inside the field rather than on a row above, and the set squares, gaps and Log button are tighter. Log set now ends at 463px on a 375x600 phone, from about 770, and clears the rest bar with the longest library name at 320x568)
## 2026-09-17 22:44

- **Delete workout leaves the gym screen.** It sat under *Remove exercise* on the one-exercise
  session screen — a whole-workout action a thumb-slip away on the screen used mid-set. It now lives
  where the workout is shown whole: on its card on Today and in its opened row in History, as a
  quiet link with the same inline confirm. The session screen keeps only what concerns the exercise
  in front of you, plus Finish / Reopen.

## 2026-09-17 22:40

- **A new account opens on a welcome, not "Rest day".** With no workouts and nothing logged, Today
  said *Rest day* and "nothing is scheduled" — untrue, and no way to greet anyone. It now welcomes
  you and offers the two ways to a plan, each with a line on what it does: *Pick a premade
  programme* or *Build your own*. Signing in to an existing account on a new phone shows the
  loading state until the first sync lands, rather than welcoming you to an app you already use.

## 2026-09-17 22:36

- **Sets are logged in order.** Any set square could be tapped, so set 3 could be logged with 1 and
  2 still empty — a record of nothing real. Only a logged set (to correct it) or the next set to do
  can now be picked; the ones further ahead are dimmed until you reach them.

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
