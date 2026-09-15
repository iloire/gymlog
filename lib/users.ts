import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
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
    createdAt: Date.now(),
  })

  return { ok: true, userId }
}
