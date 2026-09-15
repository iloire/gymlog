'use client'

import { useState, useTransition } from 'react'

import { revokeTokenAction } from '@/app/profile/api/actions'

/** Two taps, because a revoked token cannot be brought back. */
export function RevokeToken({ id, name }: { id: string; name: string }) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="h-10 shrink-0 rounded-md border border-line px-3 text-sm text-ink-dim"
      >
        Revoke
      </button>
    )
  }

  return (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="h-10 rounded-md border border-line px-3 text-sm text-ink-dim"
      >
        Keep
      </button>
      <button
        type="button"
        disabled={pending}
        aria-label={`Revoke ${name}`}
        onClick={() => startTransition(() => revokeTokenAction(id))}
        className="h-10 rounded-md bg-plate-red px-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Revoking…' : 'Revoke'}
      </button>
    </div>
  )
}
