'use client'

import { useLiveQuery } from 'dexie-react-hooks'

import { useUserId } from '@/components/session-boot'
import { readUnit } from '@/lib/sync/client'
import { DEFAULT_UNIT, type Unit } from '@/lib/units'

/**
 * The unit weights are shown in, live from `meta`: choosing it on the Units
 * page re-renders every figure on the screen without a reload, and a sync
 * that brings the other phone's choice does the same.
 */
export function useUnit(): Unit {
  const userId = useUserId()
  return useLiveQuery(() => (userId ? readUnit(userId) : DEFAULT_UNIT), [userId], DEFAULT_UNIT)
}
