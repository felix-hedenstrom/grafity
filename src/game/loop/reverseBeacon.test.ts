import { describe, expect, it } from 'vitest'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { forwardAndReverseMet, hasMet, reverseUfoCount } from './reverseBeacon'

function lineGraph(): Graph {
  const adjacency = { start: ['A'], A: ['start', 'B'], B: ['A', 'goal'], goal: ['B'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'start', isGoal: id === 'goal', x: 0, y: 0 })),
    edges: [],
    startNodeId: 'start',
    goalNodeId: 'goal',
    adjacency,
  }
}

describe('reverseUfoCount', () => {
  it('is zero while the beacon is off, whatever the fleet size', () => {
    expect(reverseUfoCount(5, false)).toBe(0)
  })

  it('re-bases half the UFOs, rounded up, so the very first UFO flips sides', () => {
    expect(reverseUfoCount(0, true)).toBe(0)
    expect(reverseUfoCount(1, true)).toBe(1)
    expect(reverseUfoCount(2, true)).toBe(1)
    expect(reverseUfoCount(3, true)).toBe(2)
    expect(reverseUfoCount(5, true)).toBe(3)
  })
})

describe('forwardAndReverseMet', () => {
  const graph = lineGraph()

  it('never fires without a reverse walker in the pool', () => {
    const walkers = [createWalker('start'), { ...createWalker('goal'), path: ['goal'] }]
    expect(forwardAndReverseMet(graph, walkers)).toBe(false)
  })

  it('stays false while the two sides are still apart', () => {
    const walkers = [createWalker('start'), createWalker('goal', 'goal')]
    expect(forwardAndReverseMet(graph, walkers)).toBe(false)
  })

  it('fires when a reverse walker becomes adjacent to a forward walker', () => {
    const forward = { ...createWalker('A'), path: ['start', 'A'] }
    const reverse = { ...createWalker('B', 'goal'), path: ['goal', 'B'] }
    expect(hasMet(graph, forward, reverse)).toBe(true)
    expect(forwardAndReverseMet(graph, [forward, reverse])).toBe(true)
  })

  it('fires when a reverse walker lands on territory a forward walker has crossed', () => {
    const forward = { ...createWalker('start'), path: ['start', 'A', 'start'], currentNodeId: 'start' }
    const reverse = { ...createWalker('A', 'goal'), path: ['goal', 'B', 'A'] }
    expect(forwardAndReverseMet(graph, [forward, reverse])).toBe(true)
  })

  it('two forward walkers near each other never count as a meet', () => {
    const forward1 = { ...createWalker('A'), path: ['start', 'A'] }
    const forward2 = { ...createWalker('B'), path: ['start', 'A', 'B'] }
    expect(forwardAndReverseMet(graph, [forward1, forward2])).toBe(false)
  })
})
