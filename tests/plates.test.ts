import { describe, expect, it } from 'vitest'

import { loadBar } from '@/lib/plates'

describe('loadBar', () => {
  it('loads the heaviest plates first, per side', () => {
    expect(loadBar(100)).toEqual({ perSide: [25, 15], totalKg: 100, exact: true })
    expect(loadBar(77.5)).toEqual({ perSide: [25, 2.5, 1.25], totalKg: 77.5, exact: true })
    expect(loadBar(140)).toEqual({ perSide: [25, 25, 10], totalKg: 140, exact: true })
  })

  it('is the empty bar at the bar weight', () => {
    expect(loadBar(20)).toEqual({ perSide: [], totalKg: 20, exact: true })
    expect(loadBar(15, 15)).toEqual({ perSide: [], totalKg: 15, exact: true })
  })

  it('loads a 15 kg bar', () => {
    expect(loadBar(40, 15)).toEqual({ perSide: [10, 2.5], totalKg: 40, exact: true })
  })

  it('says when the plates cannot make the weight, and what they make instead', () => {
    expect(loadBar(61).perSide).toEqual([20])
    expect(loadBar(61)).toMatchObject({ totalKg: 60, exact: false })
    expect(loadBar(10)).toMatchObject({ perSide: [], totalKg: 20, exact: false })
  })
})
