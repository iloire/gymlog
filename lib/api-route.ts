import { NextResponse } from 'next/server'
import { z } from 'zod'

import { tokenOwner, type TokenScope } from '@/lib/api-tokens'

/**
 * The plumbing every `/api/v1` handler shares: bearer-token auth with a scope
 * check, query and body parsing, and one JSON error shape. A handler throws
 * `ApiError` for anything the caller got wrong and returns the body otherwise.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: string[],
  ) {
    super(message)
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function errorResponse(error: ApiError, headers: Record<string, string> = {}) {
  return NextResponse.json(
    { error: error.code, message: error.message, ...(error.issues && { issues: error.issues }) },
    { status: error.status, headers: { ...NO_STORE, ...headers } },
  )
}

export type RouteInput<P> = {
  userId: string
  request: Request
  query: URLSearchParams
  params: P
}

/**
 * Wrap a handler as a route export. `scope` is what the handler needs: a
 * `write` token satisfies `read`, never the other way round. A handler returns
 * the JSON body (200), or a `NextResponse` when it needs another status.
 */
export function tokenRoute<P extends object = object>(
  scope: TokenScope,
  handler: (input: RouteInput<P>) => Promise<unknown>,
) {
  return async (request: Request, context?: { params: Promise<P> }) => {
    const owner = await tokenOwner(request)
    if (!owner) {
      return errorResponse(
        new ApiError(
          401,
          'unauthorized',
          'Send a token from Profile → API access as "Authorization: Bearer gymlog_…".',
        ),
        { 'WWW-Authenticate': 'Bearer' },
      )
    }
    if (scope === 'write' && owner.scope !== 'write') {
      return errorResponse(
        new ApiError(
          403,
          'insufficient_scope',
          'This token is read only. Create a read and write token in Profile → API access.',
        ),
        { 'WWW-Authenticate': 'Bearer error="insufficient_scope"' },
      )
    }

    try {
      const result = await handler({
        userId: owner.userId,
        request,
        query: new URL(request.url).searchParams,
        params: (await context?.params) ?? ({} as P),
      })
      if (result instanceof NextResponse) return result
      return NextResponse.json(result, { headers: NO_STORE })
    } catch (error) {
      if (error instanceof ApiError) return errorResponse(error)
      throw error
    }
  }
}

function invalid(error: z.ZodError): ApiError {
  return new ApiError(
    400,
    'bad_request',
    'The request did not match the schema at /api/v1/openapi.json.',
    error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
  )
}

export function parseQuery<T extends z.ZodType>(schema: T, query: URLSearchParams): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(query))
  if (!parsed.success) throw invalid(parsed.error)
  return parsed.data
}

export async function parseBody<T extends z.ZodType>(schema: T, request: Request): Promise<z.infer<T>> {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    throw new ApiError(400, 'bad_request', 'The body must be JSON.')
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw invalid(parsed.error)
  return parsed.data
}

export function notFound(what: string): ApiError {
  return new ApiError(404, 'not_found', `No ${what} with that id.`)
}
