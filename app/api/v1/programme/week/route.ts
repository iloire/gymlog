import { parseBody, tokenRoute } from '@/lib/api-route'
import { setWeek, weekInput } from '@/lib/api-write'

/**
 * Only used when no programme is running and one has to be started. The server
 * has no idea of the user's timezone, so this is the UTC date — off by a day
 * at worst, on a field that is only ever shown.
 */
const utcToday = () => new Date().toISOString().slice(0, 10)

export const PUT = tokenRoute('write', async ({ userId, request }) =>
  setWeek(userId, await parseBody(weekInput, request), utcToday()),
)

export const dynamic = 'force-dynamic'
