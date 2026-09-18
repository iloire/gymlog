# Design system

## The brief

A training log read at arm's length, one-handed, between sets — often with chalky hands and no
signal. The screen's job at the gym is small: show the next set, take two numbers, start the clock.
Everything else is a menu you use on the sofa.

## Palette — the plate code

Colour comes from the competition plate colours you actually see on a bar, and each one keeps its
meaning from the sport rather than from UI convention.

| Token | Value | Meaning |
|---|---|---|
| `--ground` | `#12171C` | The floor. Cold graphite, not black — rubber and steel at night |
| `--surface` | `#1A2129` | A raised row |
| `--line` | `#2C3641` | Hairlines, dividers, inactive outlines |
| `--ink` | `#EDF1F5` | Text and numbers |
| `--ink-dim` | `#8A98A6` | Labels, units, secondary figures |
| `--plate-blue` | `#0057B8` | The 20 kg plate. **Primary action** — log the set |
| `--plate-red` | `#D22630` | The 25 kg plate. **You beat last time.** Never used for errors |
| `--plate-yellow` | `#F2C300` | The 15 kg plate. **Rest running** |

### Light theme

Dark is the default. Light is a per-device choice on the profile page (Dark / Light / System),
stored in `localStorage` and never synced — the same person wants dark on the phone at the gym and
light on a laptop. `lib/theme.ts` holds an inline `<head>` script that puts `light` on `<html>`
before first paint and follows the OS under System; `app/globals.css` overrides only the neutrals
under `.light`:

| Token | Light value |
|---|---|
| `--ground` | `#EEF1F4` |
| `--surface` | `#FFFFFF` |
| `--surface-high` | `#E2E7EC` |
| `--line` | `#D2D9E0` |
| `--ink` | `#12171C` |
| `--ink-dim` | `#5A6773` |
| `--plate-yellow` | `#B38600` — ochre, because `#F2C300` is unreadable as text on a light ground |

Blue and red keep their values. Use the tokens (`text-ink`, `bg-ground`) rather than `text-white`,
except for text sitting on a plate-coloured fill.

Red means "heaviest", not "danger" — a destructive action gets a plain outline and a confirm, not
a colour. Nothing is coloured for decoration.

## Styles

Plate is one of four styles, picked on the profile page next to the mode and stored per device
(`gymlog:style`). The theme script sets `data-style` on `<html>`; each style is a block in
`app/globals.css` for dark and one for `.light`, setting every token so no style inherits half of
another. The picker previews each style by putting `data-style` on its own tile.

A style may change the palette, the typefaces and the corner radius — nothing else. Every style
keeps the three meanings, so the token names stay those of Plate and act as roles elsewhere:
`--plate-blue` is the action, `--plate-red` "you beat last time" (and, in practice, a destructive
fill with white text, so it must stay a dark enough red), `--plate-yellow` rest running.

| Style | Idea | Action / beat / rest (dark) | Figures | Body | Radius |
|---|---|---|---|---|---|
| Plate | Competition plates on graphite | `#0057B8` / `#D22630` / `#F2C300` | Archivo `wdth 112` | Archivo | `0.5rem` |
| Whiteboard | The box's workout board; chalk on slate in dark | `#2C68B8` / `#D9463E` / `#F0D65C` | Kalam 700 | Archivo | `0.25rem` |
| Iron | An old barbell club: cast iron and enamel | `#2B6E4C` / `#C0392B` / `#E8A317` | Big Shoulders 800 | Archivo `wdth 85` | `0` |
| Studio | Soft and calm | `#5452D0` / `#D9507F` / `#F0B43C` | Nunito 800 | Nunito | `1rem` |

Type is set through tokens rather than classes: `--body-font` and `--body-width` for everything,
and `--figure-font`, `--figure-weight`, `--figure-width`, `--figure-tracking` for `.figure`.
Iron's body is Archivo rather than Big Shoulders because the condensed face is unreadable at label
sizes. Only Archivo is preloaded; the other faces download the first time a style uses them and
the service worker caches them from then on, so a style first picked with no signal shows a
system fallback until the next time online.

To add a style: a dark and a `.light` block in `globals.css`, its name in `STYLES` and its two
grounds in `THEME_COLORS` (`lib/theme.ts`), a tile in `components/theme-picker.tsx`, and any new
face loaded with `preload: false` in `app/layout.tsx`.

## Type

In Plate, **Archivo** (variable), one family, doing two jobs through its width axis (other styles
swap the faces, see Styles; the rules below hold for all of them):

- **Figures** — `wdth 112`, `wght 700`, tabular, tight tracking. Weights and reps are the content,
  so they get the expanded, signage-like cut and the largest sizes on the screen.
- **Everything else** — normal width, `wght 400/600`, sentence case.

All numbers use `font-variant-numeric: tabular-nums` so a column of sets doesn't wobble as digits
change. No all-caps labels, no monospace for data.

## Structure

- **No card kit.** The session screen is a full-bleed stack: one exercise fills the viewport.
- **Logging fits the first screen.** Everything between opening an exercise and pressing *Log set*
  — the set squares, weight, reps and the button — sits above the fold on a 320 × 568 phone with the
  rest bar showing. So the exercise's library photos cross-fade in a thumbnail beside the name, not
  a full-bleed hero above it; a long name steps down a size rather than wrapping past the photo; and
  each stepper carries its label inside the field. Tapping the photo opens cues and instructions in
  a dialog, never a new page. The workout's name in the header carries
  "2/3" and opens a sheet of every exercise with its squares, a tap on any to jump; a sideways
  swipe moves to the next or previous exercise, and Previous / Next at the bottom name the
  exercise they go to.
- **Set squares carry information.** A row of squares per exercise — filled = done, outlined =
  pending. You read your progress through the workout without parsing text. Above it, last
  time's sets as a dashed, dimmed row aligned by set number, so the comparison is read down a
  column rather than out of a sentence, and a red edge below explains itself. Tapping a square
  selects that set, ringed when it is already done, so a mistyped set is fixed in place with
  Update set; a correction starts no rest timer and does not move you to the next exercise. Sets
  are logged in order: only a done set or the next one to do can be tapped, the rest are dimmed.
  A set logged heavier than the best set last time keeps a red edge inside its square. The
  *Heavier than last time* line under the steppers is a nudge before the lift and goes as soon as
  one of this exercise's sets banks it; the square is what still says so four exercises later.
  Both ask `heavierThanLastTime()` (`lib/records.ts`), so they can never disagree.
- **The rest is the screen's state.** On the session screen, the block where the steppers were
  becomes the clock while the rest runs: the time set huge and draining, the next set's numbers
  under it, and Skip rest where Log set was. Between sets you look at the phone for the time and
  then for what the next set asks, so that is what the most-viewed state shows. At zero the
  steppers return. Elsewhere **the rest timer is a rule that drains** across the bottom edge,
  above the thumb, rather than a number in a box. Yellow while running, gone when it ends. *+30 s* and *Skip* sit on the bar
  beside the clock, because that is where the thumb already is. Off the session screen it sits
  above the tabs and its label is a link back to the workout. The last set of the workout starts
  no rest: there is nothing to rest for, and *Finish workout* is what the screen offers instead
  (`startRest()` in `lib/rest.ts` decides, so no screen can get it wrong).
- **Thumb zone.** Primary actions sit in the bottom third; minimum 56px targets; weight and reps
  adjust with −/+ in one rep and one equipment step (2.5 kg on a barbell, 2 on dumbbells, 5 on
  a stack — `lib/weights.ts`), held to repeat, because typing with chalk on your hands is
  miserable. Under the weight, chips for the weights within reach and, on a barbell lift, the
  plates per side drawn in the plate colours.
- **Finishing a workout pays out.** *Finish workout* hands the screen to the summary
  (`components/workout-summary.tsx`): the kilos moved set at the largest size on the screen, then
  every exercise that beat last time with what it added and the set it beat, then the week streak
  and what was logged. Red is the delta and only the delta — the total stays ink, or three earned
  red lines drown under one decorative one. What counts as beating last time is decided once, in
  `lib/records.ts`, and it claims nothing it cannot show a number for.
- **The gym screen acts on the exercise in front of you.** Anything about the whole workout —
  adding an exercise, deleting the workout (`components/delete-session.tsx`) — lives where the
  workout is shown whole: its card on Today, its row in History. Only Finish / Reopen stay: Finish takes
  the Log button's place once every set is logged, so the summary is the next tap; ending a workout cut short
  (`components/finish-session.tsx`) is on Today and History too, behind a confirm. What acts on
  the exercise but is never wanted mid-set — Remove exercise, and Swap exercise when it lands — is
  behind a ⋮ beside the name (`components/overflow-menu.tsx`), two taps and a modal confirm away,
  never a button under Next where a thumb reaching for it can land.
- **Sign in** is the one screen with a picture: equipment in one plate colour, no people, with the
  wordmark set large on its lower edge. See `docs/login-images.md`.
- **A screen loads as its own frame.** Every screen reads off IndexedDB, which answers a frame or
  two after the page paints. In that gap a screen draws what it knows without data — the tabs,
  the back link, a heading that never changes — and a pulsing block the size of what it waits
  for (`Loading` and `Placeholder` in `components/loading.tsx`), so nothing moves when the rows
  land. Never a "Loading…" in the corner, and never an empty state: on a cold start in the gym,
  *Rest day* or *No workouts yet* for one frame is a lie the eye catches.
- Motion answers a tap (a set collapsing into a square, the timer draining). Nothing animates on
  load, and everything respects `prefers-reduced-motion`.
