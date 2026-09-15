import { apiHistory, historyQuery } from '@/lib/api'
import { parseQuery, tokenRoute } from '@/lib/api-route'

export const GET = tokenRoute('read', ({ userId, query }) =>
  apiHistory(userId, parseQuery(historyQuery, query)),
)

export const dynamic = 'force-dynamic'
