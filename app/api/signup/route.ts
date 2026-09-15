import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createUser } from '@/lib/users'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().max(80).optional(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }

  const { email, password, name } = parsed.data
  const result = await createUser(email, password, name?.length ? name : null)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
