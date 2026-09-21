import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n'
import { newId } from '@/lib/id'

const BCRYPT_ROUNDS = 12

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'email_taken' }

/**
 * Real accounts from day one — no hardcoded user, no shared admin password.
 * Anything user-owned is keyed on the id returned here.
 */
export async function createUser(
  email: string,
  password: string,
  name: string | null,
  /** The language the person signed up in, so their first sync does not flip it back. */
  locale: Locale = DEFAULT_LOCALE,
): Promise<CreateUserResult> {
  const normalized = email.trim().toLowerCase()

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1)

  if (existing) return { ok: false, error: 'email_taken' }

  const userId = newId()
  await db.insert(users).values({
    id: userId,
    email: normalized,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    name,
    locale,
    createdAt: Date.now(),
  })

  return { ok: true, userId }
}
