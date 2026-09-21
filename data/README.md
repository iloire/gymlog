# data/

Config you edit by hand. Each file is bundled into the app, so everything here works offline, and
`npm test` checks it against the exercise library before it can ship.

| File | What it drives |
|---|---|
| `exercise-filter.json` | Which exercises `npm run exercises:import` brings in |
| `login-images.json` | The sign in pictures — see `docs/login-images.md` |
| `equipment.json` | Equipment you can tick, its presets, and what exercises need |
| `programmes/*.json` | The premade programmes on `/programmes` |

## Premade programmes

Picking a programme **copies** it into ordinary workouts (and, with *Start this programme*, onto
your week, ending the current programme). Editing a file later changes nothing for anyone who
already adopted it.

### `programmes/<id>.json`

```jsonc
{
  "id": "full-body-3-day",          // must equal the file name
  "name": { "en": "Full body, 3 days", "es": "Cuerpo entero, 3 días" },   // or a plain English string
  "level": "beginner",              // beginner | novice | intermediate
  "summary": { "en": "One or two sentences shown in the catalogue.", "es": "…" },
  "week": ["a", null, "b", null, "a", null, null],   // Monday … Sunday: workout key or null (rest)
  "workouts": {
    "a": {
      "name": { "en": "Full body A", "es": "Cuerpo entero A" },   // becomes the workout's name, in the adopter's language
      "exercises": [
        {
          "exercise": "Barbell_Squat",                        // library id (db/seed-exercises.json)
          "alternatives": ["Leg_Press", "Bodyweight_Squat"],  // optional, tried in order
          "sets": 3,
          "reps": 5,
          "restSec": 180,
          "startKg": 20,             // optional; applied to `exercise` only, never an alternative
          "notes": "Pause at the bottom"                      // optional
        }
      ]
    }
  }
}
```

- **Names are per language**: `name`, `summary` and each workout's `name` are either a plain string
  (English) or `{ "en": …, "es": … }` with both languages; a file with one missing fails to load.
  The same goes for `items[].name` and `presets[].name` in `equipment.json`.
- **Every workout must appear in `week`**, and every key in `week` must be a workout.
- The user can move the whole week to other days (Mon/Wed/Fri → Tue/Thu/Sat) before adopting.
- Reps are a single target: the editor and the gym screen do not show rep ranges yet.
- **Adding a file**: import it in `lib/programmes.ts` and add it to `PROGRAMMES`. A test fails if a
  file in this folder is not registered.
- Every programme must be doable **as written in a full gym** (a test checks it). Alternatives are
  what make it work at home.

### Choosing an exercise

For each slot, the first of `exercise`, then `alternatives` in order, that your equipment allows is
used. If none is, the option missing the fewest items is used, and the picker shows what it needs.

## `equipment.json`

```jsonc
{
  "items":   [{ "id": "rack", "name": "Squat rack" }],                  // what you can tick
  "presets": [{ "id": "home-rack", "name": "Home rack", "items": ["barbell", "rack"] }],
  "needs":   { "Barbell_Squat": ["rack"] }                              // extras per exercise
}
```

An exercise needs its library `equipment` value (`barbell`, `dumbbell`, `kettlebells`, `cable`,
`machine`, `e-z curl bar`, …; `body only` needs nothing, and `other` names no item) **plus**
anything under `needs`. So item ids must match the library values exactly (a test checks every
value has one), and `needs` only lists what the library cannot say: a squat needs a
rack, a chin-up needs a bar, a dumbbell bench press needs a bench.

Your ticked equipment is saved in `localStorage` on the device (`gymlog:equipment`) and never
synced, like the theme.
