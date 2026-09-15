/**
 * Seeds the global exercise library — `exercises.userId IS NULL`, shared by
 * every account and read-only to them. Idempotent: re-running upserts by id.
 *
 *   npm run db:seed          # .env.local
 *   npm run db:seed:prod     # .env.prod
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

import { exercises } from './schema'

type SeedExercise = {
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

const CHUNK = 200

/** drizzle has no typed `excluded` helper for sqlite upserts; raw is fine here. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')

  const file = path.resolve(__dirname, 'seed-exercises.json')
  const seeds: SeedExercise[] = JSON.parse(await readFile(file, 'utf8'))

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  const db = drizzle(client)
  const now = Date.now()

  for (let i = 0; i < seeds.length; i += CHUNK) {
    const rows = seeds.slice(i, i + CHUNK).map((seed) => ({
      ...seed,
      userId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      // Global rows sit at rev 0; they are pulled on the bootstrap sync
      // (cursor 0) and never change, so they never need a per-user rev.
      rev: 0,
    }))

    await db
      .insert(exercises)
      .values(rows)
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          name: sqlExcluded('name'),
          slug: sqlExcluded('slug'),
          category: sqlExcluded('category'),
          level: sqlExcluded('level'),
          force: sqlExcluded('force'),
          mechanic: sqlExcluded('mechanic'),
          equipment: sqlExcluded('equipment'),
          primaryMuscles: sqlExcluded('primary_muscles'),
          secondaryMuscles: sqlExcluded('secondary_muscles'),
          instructions: sqlExcluded('instructions'),
          images: sqlExcluded('images'),
          updatedAt: sqlExcluded('updated_at'),
        },
      })
  }

  console.log(`seeded ${seeds.length} global exercises into ${url}`)
  client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
