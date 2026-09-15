import { apiBodyweight, rangeQuery } from '@/lib/api'
import { parseBody, parseQuery, tokenRoute } from '@/lib/api-route'
import { bodyweightInput, recordBodyweight } from '@/lib/api-write'

export const GET = tokenRoute('read', ({ userId, query }) =>
  apiBodyweight(userId, parseQuery(rangeQuery, query)),
)

export const PUT = tokenRoute('write', async ({ userId, request }) =>
  recordBodyweight(userId, await parseBody(bodyweightInput, request)),
)

export const dynamic = 'force-dynamic'
