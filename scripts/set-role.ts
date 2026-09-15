/**
 * Grant or revoke admin on an existing account. There is deliberately no way to
 * do this from the app, and no admin in the seed data.
 *
 *   npm run user:role -- someone@example.com admin        # .env.local
 *   npm run user:role:prod -- someone@example.com user    # .env.prod
 *
 * Takes effect on the account's next request; no sign-out needed.
 */
import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

import { users } from '../db/schema'

const ROLES = ['user', 'admin'] as const

async function main() {
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL is not set')

  const [email, role] = process.argv.slice(2)
  if (!email || !ROLES.includes(role as (typeof ROLES)[number])) {
    throw new Error('usage: npm run user:role -- <email> <user|admin>')
  }

  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  const updated = await drizzle(client)
    .update(users)
    .set({ role: role as (typeof ROLES)[number] })
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning({ email: users.email, role: users.role })
  client.close()

  if (!updated.length) throw new Error(`no account with email ${email}`)
  console.log(`${updated[0]?.email} is now ${updated[0]?.role}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
