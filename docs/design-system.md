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
- **Set squares carry information.** A row of squares per exercise — filled = done, outlined =
  pending. You read your progress through the workout without parsing text.
- **The rest timer is a rule that drains** across the bottom edge, above the thumb, rather than a
  number in a box. Yellow while running, gone when it ends.
- **Thumb zone.** Primary actions sit in the bottom third; minimum 56px targets; weight and reps
  adjust with −/+ in 2.5 kg and 1 rep steps, because typing with chalk on your hands is miserable.
- **Sign in** is the one screen with a picture: equipment in one plate colour, no people, with the
  wordmark set large on its lower edge. See `docs/login-images.md`.
- Motion answers a tap (a set collapsing into a square, the timer draining). Nothing animates on
  load, and everything respects `prefers-reduced-motion`.
