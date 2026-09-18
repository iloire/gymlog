import { describe, expect, it } from 'vitest'

import { loadBar } from '@/lib/plates'

describe('loadBar', () => {
  it('loads the heaviest plates first, per side', () => {
    expect(loadBar(100)).toEqual({ perSide: [25, 15], total: 100, exact: true })
    expect(loadBar(77.5)).toEqual({ perSide: [25, 2.5, 1.25], total: 77.5, exact: true })
    expect(loadBar(140)).toEqual({ perSide: [25, 25, 10], total: 140, exact: true })
  })

  it('is the empty bar at the bar weight', () => {
    expect(loadBar(20)).toEqual({ perSide: [], total: 20, exact: true })
    expect(loadBar(15, 15)).toEqual({ perSide: [], total: 15, exact: true })
  })

  it('loads a 15 kg bar', () => {
    expect(loadBar(40, 15)).toEqual({ perSide: [10, 2.5], total: 40, exact: true })
  })

  it('says when the plates cannot make the weight, and what they make instead', () => {
    expect(loadBar(61).perSide).toEqual([20])
    expect(loadBar(61)).toMatchObject({ total: 60, exact: false })
    expect(loadBar(10)).toMatchObject({ perSide: [], total: 20, exact: false })
  })

  it('loads pound plates on a pound bar', () => {
    expect(loadBar(135, 45, 'lb')).toEqual({ perSide: [45], total: 135, exact: true })
    expect(loadBar(225, 45, 'lb')).toEqual({ perSide: [45, 45], total: 225, exact: true })
    expect(loadBar(185, 45, 'lb')).toEqual({ perSide: [45, 25], total: 185, exact: true })
    expect(loadBar(95, 35, 'lb')).toEqual({ perSide: [25, 5], total: 95, exact: true })
    expect(loadBar(137, 45, 'lb')).toMatchObject({ perSide: [45], total: 135, exact: false })
  })
})
