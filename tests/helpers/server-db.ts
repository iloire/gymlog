import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

import * as schema from '@/db/schema'

export type TestDb = LibSQLDatabase<typeof schema>

/**
 * A real, migrated SQLite database on disk — not `:memory:`. libsql runs an
 * interactive transaction on its own connection, and an in-memory database is
 * private to the connection that opened it, so the transaction would see an
 * empty schema. Foreign keys are enforced, exactly as they are on Turso.
 */
export async function createTestDb(): Promise<{ db: TestDb; cleanup: () => void }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'gymlog-test-'))
  const client = createClient({ url: `file:${path.join(dir, 'test.db')}` })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './db/migrations' })

  return {
    db,
    cleanup: () => {
      client.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

export async function insertUser(db: TestDb, id: string, email = `${id}@example.com`) {
  await db.insert(schema.users).values({ id, email, passwordHash: 'x', createdAt: 1 })
}
