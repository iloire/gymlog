import { NextResponse } from 'next/server'

import { openApiSpec } from '@/lib/api-openapi'

/**
 * Public, like any API's docs: it describes the endpoints and holds no data.
 * ChatGPT's GPT Actions and most agent frameworks import this URL directly.
 */
export function GET(request: Request) {
  return NextResponse.json(openApiSpec(new URL(request.url).origin))
}

export const dynamic = 'force-dynamic'
