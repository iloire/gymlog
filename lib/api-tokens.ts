import { createHash, randomBytes } from 'node:crypto'

import { and, count, desc, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { apiTokens } from '@/db/schema'
import { currentUserId } from '@/lib/auth'
import { newId } from '@/lib/id'

/**
 * Personal access tokens for the `/api/v1` API.
 *
 * Managing tokens needs the signed-in session (`currentUserId()`); using one
 * needs only the token. Either way the user id comes from the server — a token
 * is looked up by its hash, and the row it finds says whose data it touches.
 * A `read` token can only read; a `write` token can also change workouts, the
 * week and bodyweight through `lib/api-write.ts`. No token ever authenticates
 * `/api/sync`, which stays the device's own channel.
 */

/** Recognisable in a leaked paste or a secret scanner. */
const TOKEN_PREFIX = 'gymlog_'
/** How much of the token the list shows, prefix included. */
const DISPLAY_CHARS = 12
export const MAX_ACTIVE_TOKENS = 10
/** `lastUsedAt` is a hint for the user, not an audit log — one write a minute is plenty. */
const LAST_USED_RESOLUTION_MS = 60_000

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
}

export const TOKEN_SCOPES = ['read', 'write'] as const
export type TokenScope = (typeof TOKEN_SCOPES)[number]

export type TokenSummary = {
  id: string
  name: string
  scope: TokenScope
  prefix: string
  createdAt: number
  lastUsedAt: number | null
}

/** The signed-in user's tokens that still work, newest first. */
export async function listApiTokens(): Promise<TokenSummary[]> {
  const userId = await currentUserId()
  if (!userId) return []

  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      scope: apiTokens.scope,
      prefix: apiTokens.prefix,
      createdAt: apiTokens.createdAt,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt))
}

/** Why a token was not made; the page puts it into words in its language. */
export type CreateTokenError = 'signedOut' | 'nameMissing' | 'nameTooLong' | 'badScope' | 'tooMany'

export type CreateTokenResult =
  | { ok: true; token: string; summary: TokenSummary }
  | { ok: false; error: CreateTokenError; max?: number }

/** Mint a token for the signed-in user. The secret is in the result and nowhere else. */
export async function createApiToken(
  rawName: string,
  scope: TokenScope = 'read',
): Promise<CreateTokenResult> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'signedOut' }

  const name = rawName.trim()
  if (!name) return { ok: false, error: 'nameMissing' }
  if (name.length > 60) return { ok: false, error: 'nameTooLong' }
  if (!TOKEN_SCOPES.includes(scope)) return { ok: false, error: 'badScope' }

  const [tally] = await db
    .select({ active: count() })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
  if ((tally?.active ?? 0) >= MAX_ACTIVE_TOKENS) {
    return { ok: false, error: 'tooMany', max: MAX_ACTIVE_TOKENS }
  }

  const token = generateToken()
  const summary: TokenSummary = {
    id: newId(),
    name,
    scope,
    prefix: token.slice(0, DISPLAY_CHARS),
    createdAt: Date.now(),
    lastUsedAt: null,
  }
  await db.insert(apiTokens).values({ ...summary, userId, tokenHash: hashToken(token) })

  return { ok: true, token, summary }
}

/** Revoke one of the signed-in user's tokens. Someone else's id matches nothing. */
export async function revokeApiToken(id: string): Promise<void> {
  const userId = await currentUserId()
  if (!userId) return

  await db
    .update(apiTokens)
    .set({ revokedAt: Date.now() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
}

export type TokenOwner = { userId: string; scope: TokenScope }

/** Whose token a request's `Authorization: Bearer gymlog_…` header carries, or null. */
export async function tokenOwner(request: Request): Promise<TokenOwner | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')
  const token = match?.[1]
  if (!token?.startsWith(TOKEN_PREFIX)) return null

  const [row] = await db
    .select({
      id: apiTokens.id,
      userId: apiTokens.userId,
      scope: apiTokens.scope,
      lastUsedAt: apiTokens.lastUsedAt,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)))
    .limit(1)
  if (!row) return null

  const now = Date.now()
  if (row.lastUsedAt === null || now - row.lastUsedAt >= LAST_USED_RESOLUTION_MS) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id))
  }

  return { userId: row.userId, scope: row.scope }
}
