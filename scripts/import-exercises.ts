/**
 * Imports the public-domain exercise library from yuhonas/free-exercise-db
 * (Unlicense) into `db/seed-exercises.json`, and vendors each exercise's two
 * photos into `public/exercise-media/<id>/{0,1}.webp`.
 *
 * The two photos are the start and end position of the movement. The UI
 * cross-fades between them, which reads as the movement being performed — no
 * GIF, no video, no licensing question.
 *
 * Images are vendored rather than hot-linked so the library works in a gym
 * basement with no signal. Re-running is idempotent: existing files are skipped.
 *
 *   npm run exercises:import
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  matchesFilter,
  uniqueSlug,
  type ExerciseFilter,
  type SourceExercise,
} from '../lib/exercise-import'

type Filter = ExerciseFilter & {
  source: string
  imageBaseUrl: string
  imageWidth: number
  imageQuality: number
}

export type SeedExercise = {
  id: string
  name: string
  slug: string
  category: string | null
  level: string | null
  force: string | null
  mechanic: string | null
  equipment: string | null
  primaryMuscles: string[]
  secondaryMuscles: string[]
  instructions: string[]
  images: string[]
}

const ROOT = path.resolve(__dirname, '..')
const MEDIA_DIR = path.join(ROOT, 'public', 'exercise-media')
const OUT_FILE = path.join(ROOT, 'db', 'seed-exercises.json')

async function vendorImage(
  sourceUrl: string,
  destination: string,
  filter: Filter,
): Promise<boolean> {
  if (existsSync(destination)) return true

  const response = await fetch(sourceUrl)
  if (!response.ok) {
    console.warn(`  ! ${response.status} ${sourceUrl}`)
    return false
  }

  const input = Buffer.from(await response.arrayBuffer())
  const output = await sharp(input)
    .resize({ width: filter.imageWidth, withoutEnlargement: true })
    .webp({ quality: filter.imageQuality })
    .toBuffer()

  await writeFile(destination, output)
  return true
}

async function main() {
  const filter: Filter = JSON.parse(
    await readFile(path.join(ROOT, 'data', 'exercise-filter.json'), 'utf8'),
  )

  console.log(`fetching ${filter.source}`)
  const response = await fetch(filter.source)
  if (!response.ok) throw new Error(`source fetch failed: ${response.status}`)
  const all: SourceExercise[] = await response.json()

  const selected = all.filter((exercise) => matchesFilter(exercise, filter))
  console.log(`${selected.length} of ${all.length} exercises match data/exercise-filter.json`)

  const seeds: SeedExercise[] = []
  const usedSlugs = new Set<string>()
  let downloaded = 0

  for (const [index, exercise] of selected.entries()) {
    const dir = path.join(MEDIA_DIR, exercise.id)
    await mkdir(dir, { recursive: true })

    const images: string[] = []
    for (const [frame, imagePath] of exercise.images.slice(0, 2).entries()) {
      const destination = path.join(dir, `${frame}.webp`)
      const existed = existsSync(destination)
      const ok = await vendorImage(`${filter.imageBaseUrl}${imagePath}`, destination, filter)
      if (!ok) continue
      if (!existed) downloaded += 1
      images.push(`exercise-media/${exercise.id}/${frame}.webp`)
    }

    if (filter.requireImages && images.length < 2) {
      console.warn(`  ! skipping ${exercise.name} — images unavailable`)
      continue
    }

    const slug = uniqueSlug(exercise.name, exercise.equipment, usedSlugs)

    seeds.push({
      id: exercise.id,
      name: exercise.name,
      slug,
      category: exercise.category || null,
      level: exercise.level || null,
      force: exercise.force,
      mechanic: exercise.mechanic,
      equipment: exercise.equipment,
      primaryMuscles: exercise.primaryMuscles,
      secondaryMuscles: exercise.secondaryMuscles,
      instructions: exercise.instructions,
      images,
    })

    if ((index + 1) % 50 === 0) {
      console.log(`  ${index + 1}/${selected.length}…`)
    }
  }

  await writeFile(OUT_FILE, `${JSON.stringify(seeds, null, 2)}\n`)
  console.log(`wrote ${seeds.length} exercises to db/seed-exercises.json`)
  console.log(`vendored ${downloaded} new images into public/exercise-media/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
