import { NextResponse } from 'next/server'

import { apiWorkouts } from '@/lib/api'
import { parseBody, tokenRoute } from '@/lib/api-route'
import { createWorkout, workoutInput } from '@/lib/api-write'

export const GET = tokenRoute('read', ({ userId }) => apiWorkouts(userId))

export const POST = tokenRoute('write', async ({ userId, request }) => {
  const workout = await createWorkout(userId, await parseBody(workoutInput, request))
  return NextResponse.json(workout, { status: 201 })
})

export const dynamic = 'force-dynamic'
