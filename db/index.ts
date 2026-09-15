import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'

import { env } from '@/lib/env'
import * as schema from './schema'

type Database = LibSQLDatabase<typeof schema>

let client: Client | null = null
let instance: Database | null = null

function connect(): Database {
  if (!instance) {
    client = createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN,
    })
    instance = drizzle(client, { schema })
  }
  return instance
}

/**
 * Lazy — nothing connects at import time, so importing a module that merely
 * references `db` does not open a socket during the build.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop: string | symbol) {
    return Reflect.get(connect(), prop)
  },
})

export { schema }
