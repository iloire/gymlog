'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { publicEnv } from '@/lib/env.public'
import { sync, type SyncResult } from '@/lib/sync/client'

const SYNC_INTERVAL_MS = 30_000
const CACHED_USER_KEY = 'gymlog:userId'

/**
 * NextAuth resolves the session by fetching /api/auth/session, which fails with
 * no signal — and then the app has no user id, so it cannot read its own local
 * data and shows an empty screen in exactly the place it is meant to work.
 *
 * So the signed-in id is remembered on the device and used when the session
 * endpoint is unreachable. This grants no server access: the JWT cookie still
 * has to satisfy the server on the next sync. It only unlocks data that is
 * already on this device. Signing out clears it and wipes the database.
 */
function readCachedUserId(): string | null {
  try {
    return localStorage.getItem(CACHED_USER_KEY)
  } catch {
    return null
  }
}

function writeCachedUserId(userId: string | null): void {
  try {
    if (userId) localStorage.setItem(CACHED_USER_KEY, userId)
    else localStorage.removeItem(CACHED_USER_KEY)
  } catch {
    // Private mode or blocked storage: the app still works while online.
  }
}

type SyncState = {
  userId: string | null
  status: 'idle' | 'syncing' | 'offline' | 'error'
  lastSyncAt: number | null
  syncNow: () => Promise<SyncResult | null>
}

const SyncContext = createContext<SyncState>({
  userId: null,
  status: 'idle',
  lastSyncAt: null,
  syncNow: async () => null,
})

export function useSync(): SyncState {
  return useContext(SyncContext)
}

/** The signed-in user id — from the live session, or from this device. */
export function useUserId(): string | null {
  return useContext(SyncContext).userId
}

function SyncRunner({ children }: { children: ReactNode }) {
  const { data: session, status: authStatus } = useSession()
  const sessionUserId = session?.user?.id ?? null

  const [cachedUserId, setCachedUserId] = useState<string | null>(null)
  const [status, setStatus] = useState<SyncState['status']>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const running = useRef(false)

  // localStorage cannot be read while rendering — it does not exist on the
  // server, and reading it during hydration would make the first client render
  // disagree with the server HTML. So it is read once, after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only storage, read after mount by necessity
  useEffect(() => setCachedUserId(readCachedUserId()), [])

  useEffect(() => {
    if (sessionUserId) {
      writeCachedUserId(sessionUserId)
      return
    }
    // Only a confirmed sign-out clears it — a failed fetch must not.
    if (authStatus === 'unauthenticated' && navigator.onLine) {
      writeCachedUserId(null)
    }
  }, [sessionUserId, authStatus])

  const userId = sessionUserId ?? cachedUserId

  const syncNow = useCallback(async () => {
    if (!userId || running.current) return null
    running.current = true
    setStatus('syncing')
    try {
      const result = await sync(userId)
      setStatus(result.ok ? 'idle' : result.reason === 'offline' ? 'offline' : 'error')
      if (result.ok) setLastSyncAt(Date.now())
      return result
    } finally {
      running.current = false
    }
  }, [userId])

  // Registered regardless of sign-in state: without it a navigation with no
  // signal falls through to the browser's offline page, and the app is
  // unusable in exactly the place it is meant to be used.
  useEffect(() => {
    const dev = process.env.NODE_ENV !== 'production'
    if (dev && !publicEnv.serviceWorkerInDev) return

    void navigator.serviceWorker?.register(dev ? '/sw.js?dev=1' : '/sw.js').catch(() => {
      // An unsupported or blocked worker just means no offline shell.
    })
  }, [])

  useEffect(() => {
    if (!userId) return

    // Persisted storage, or iOS evicts IndexedDB from a low-engagement site and
    // takes an unsynced outbox with it.
    void navigator.storage?.persist?.()

    void syncNow()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }

    window.addEventListener('online', syncNow)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => {
      if (navigator.onLine) void syncNow()
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('online', syncNow)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [userId, syncNow])

  const value = useMemo(
    () => ({ userId, status, lastSyncAt, syncNow }),
    [userId, status, lastSyncAt, syncNow],
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function SessionBoot({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SyncRunner>{children}</SyncRunner>
    </SessionProvider>
  )
}
