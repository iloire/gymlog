import { apiExercises, exercisesQuery } from '@/lib/api'
import { parseQuery, tokenRoute } from '@/lib/api-route'

export const GET = tokenRoute('read', ({ userId, query }) =>
  apiExercises(userId, parseQuery(exercisesQuery, query)),
)

export const dynamic = 'force-dynamic'
