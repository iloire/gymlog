'use server'

import { refresh } from 'next/cache'

import { createApiToken, revokeApiToken, type CreateTokenResult, type TokenScope } from '@/lib/api-tokens'

export async function createTokenAction(
  _previous: CreateTokenResult | null,
  formData: FormData,
): Promise<CreateTokenResult> {
  // createApiToken refuses anything that is not a known scope.
  const scope = String(formData.get('scope') ?? 'read') as TokenScope
  const result = await createApiToken(String(formData.get('name') ?? ''), scope)
  if (result.ok) refresh()
  return result
}

export async function revokeTokenAction(id: string): Promise<void> {
  await revokeApiToken(id)
  refresh()
}
