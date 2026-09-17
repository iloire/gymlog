'use client'

import { useEffect, useState } from 'react'

/**
 * Whether to show the Admin link. Part of the desk-only /admin exception to
 * "the client never reads the network": the role is not synced to the device,
 * so this asks the server. No signal means no link — and no /admin either.
 */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    let live = true
    fetch('/api/admin/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { admin?: unknown } | null) => {
        if (live) setAdmin(body?.admin === true)
      })
      .catch(() => {
        // Offline: the link stays hidden.
      })
    return () => {
      live = false
    }
  }, [])

  return admin
}
