import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

// Wrapped in main() rather than top-level await: the package is CJS, and tsx
// refuses top-level await under the "cjs" output format.
async function main() {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  await migrate(drizzle(client), { migrationsFolder: './db/migrations' })
  console.log(`migrated ${url}`)
  client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
