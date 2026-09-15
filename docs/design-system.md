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
under `:root.light`:

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

## Type

**Archivo** (variable), one family, doing two jobs through its width axis:

- **Figures** — `wdth 112`, `wght 700`, tabular, tight tracking. Weights and reps are the content,
  so they get the expanded, signage-like cut and the largest sizes on the screen.
- **Everything else** — normal width, `wght 400/600`, sentence case.

All numbers use `font-variant-numeric: tabular-nums` so a column of sets doesn't wobble as digits
change. No all-caps labels, no monospace for data.

## Structure

- **No card kit.** The session screen is a full-bleed stack: one exercise fills the viewport.
- **The session opens on the movement.** The exercise's library photos cross-fade full-bleed at
  the top, fading into the ground with the exercise name set on that edge; tapping it opens cues
  and instructions in a dialog, never a new page. A thin segment per exercise under the header
  fills blue as each one is finished, and Previous / Next name the exercise they go to.
- **Set squares carry information.** A row of squares per exercise — filled = done, outlined =
  pending. You read your progress through the workout without parsing text. Tapping a square
  selects that set, ringed when it is already done, so a mistyped set is fixed in place with
  Update set; a correction starts no rest timer and does not move you to the next exercise.
- **The rest timer is a rule that drains** across the bottom edge, above the thumb, rather than a
  number in a box. Yellow while running, gone when it ends.
- **Thumb zone.** Primary actions sit in the bottom third; minimum 56px targets; weight and reps
  adjust with −/+ in 2.5 kg and 1 rep steps, because typing with chalk on your hands is miserable.
- **Sign in** is the one screen with a picture: equipment in one plate colour, no people, with the
  wordmark set large on its lower edge. See `docs/login-images.md`.
- Motion answers a tap (a set collapsing into a square, the timer draining). Nothing animates on
  load, and everything respects `prefers-reduced-motion`.
