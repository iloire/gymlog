# Sign in pictures

The sign in and sign up screens show a picture behind the wordmark, one picked at random per visit
from `data/login-images.json`. Most people see this screen once per phone, so a handful of
pictures is plenty.

The three pictures in the repo now (`plate`, `loaded`, `knurl`) are drawn in code as stand-ins.
Replace them with photos when you have them.

## data/login-images.json

```json
{
  "images": [
    { "src": "/auth-media/plate.webp", "position": "60% 55%" }
  ]
}
```

| Field | Meaning |
|---|---|
| `src` | Path under `public/`. Must be in `/auth-media/` — `proxy.ts` excludes that directory, so signed-out visitors can load it. Anywhere else redirects to `/login` and the picture never shows. |
| `position` | CSS `object-position` for the crop. A phone shows a wide band from the middle; a desk shows a tall column. Point it at the subject. |

`tests/login-images.test.ts` fails if a listed file is missing, is over 250 KB, or would be
blocked by the proxy.

## Adding a picture

1. Export **1600 × 2000 (4:5) WebP**, quality around 72, **under 250 KB** — this is the first page
   a new user loads, often on mobile data.
2. Keep the subject in the **upper two thirds**. The bottom fades into the background under the
   wordmark, and on a desk the right edge fades into the form.
3. Drop it in `public/auth-media/`, add a row to `data/login-images.json`, run `npm test`.
4. Check the licence allows commercial use if it came from an image generator or stock site.

## Art direction

The pictures follow the plate code in `docs/design-system.md`:

- **Dark and quiet.** Cold graphite, one hard light, deep shadow. The form has to stay the loudest
  thing on the screen.
- **One plate colour per picture** — red, blue or yellow — and everything else desaturated.
- **Equipment, no people.** The app is for anyone; a particular body in the hero says who it is
  for. It also avoids hands and faces, which generators still get wrong.
- No text, logos or brand names on the equipment.

## Prompts

Written for Midjourney / Flux; append the style line to each subject.

**Style line:**

> dark moody photograph, cold graphite tones, single hard overhead light, deep shadows, heavily
> desaturated except for one competition bumper plate colour, subtle 35mm film grain, shallow depth
> of field, no people, no text, no logos, empty space in the lower third, portrait 4:5
> (Midjourney: `--ar 4:5 --style raw`)

**Subjects:**

1. A stack of black bumper plates on a rubber gym floor, a single red 25 kg plate on top catching
   the light.
2. Extreme close-up of a barbell's knurling dusted with chalk, a yellow collar out of focus at the
   edge of frame.
3. A loaded barbell resting on a lifting platform, seen from floor level, blue plates, bare
   concrete basement wall behind.
4. An empty squat rack in a concrete basement lit by one bare bulb, blue plates hanging on the
   storage pegs.
5. A red bumper plate lying flat on a rubber floor, shot from directly above, hard shadow falling
   to one side.
6. A cloud of chalk dust hanging in a narrow beam of light over a barbell, yellow plate blurred in
   the background.
