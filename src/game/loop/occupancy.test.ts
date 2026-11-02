import { describe, expect, it } from 'vitest'
import { claimedNodeIds } from './occupancy'
import type { OccupancyEntry } from './occupancy'

describe('claimedNodeIds', () => {
  it('is empty when there is only one walker', () => {
    const entries: OccupancyEntry[] = [{ currentNodeId: 'a', transitTarget: null }]
    expect(claimedNodeIds(entries, 0)).toEqual(new Set())
  })

  it('claims a resting walker\'s current node', () => {
    const entries: OccupancyEntry[] = [
      { currentNodeId: 'a', transitTarget: null },
      { currentNodeId: 'b', transitTarget: null },
    ]
    expect(claimedNodeIds(entries, 0)).toEqual(new Set(['b']))
  })

  it('also claims an in-flight walker\'s transit destination', () => {
    const entries: OccupancyEntry[] = [
      { currentNodeId: 'a', transitTarget: null },
      { currentNodeId: 'b', transitTarget: 'c' },
    ]
    expect(claimedNodeIds(entries, 0)).toEqual(new Set(['b', 'c']))
  })

  it('excludes the self entry', () => {
    const entries: OccupancyEntry[] = [
      { currentNodeId: 'a', transitTarget: 'x' },
      { currentNodeId: 'b', transitTarget: null },
    ]
    expect(claimedNodeIds(entries, 0)).toEqual(new Set(['b']))
  })
})
