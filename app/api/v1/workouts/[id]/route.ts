import { apiWorkouts } from '@/lib/api'
import { notFound, parseBody, tokenRoute } from '@/lib/api-route'
import { deleteWorkout, replaceWorkout, workoutInput } from '@/lib/api-write'

type Params = { id: string }

export const GET = tokenRoute<Params>('read', async ({ userId, params }) => {
  const [workout] = (await apiWorkouts(userId, params.id)).workouts
  if (!workout) throw notFound('workout')
  return workout
})

export const PUT = tokenRoute<Params>('write', async ({ userId, params, request }) =>
  replaceWorkout(userId, params.id, await parseBody(workoutInput, request)),
)

export const DELETE = tokenRoute<Params>('write', ({ userId, params }) => deleteWorkout(userId, params.id))

export const dynamic = 'force-dynamic'
