import { apiProfile } from '@/lib/api'
import { tokenRoute } from '@/lib/api-route'

export const GET = tokenRoute('read', ({ userId }) => apiProfile(userId))

export const dynamic = 'force-dynamic'
