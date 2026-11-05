import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { leastVisitedStar } from './leastVisitedStar'
import type { StrategyContext } from './types'

function hubGraph(): Graph {
  const adjacency = { hub: ['a', 'b', 'c'], a: ['hub'], b: ['hub'], c: ['hub'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: false })),
    edges: [],
    startNodeId: 'hub',
    goalNodeId: 'none',
    adjacency,
  }
}

describe('leastVisitedStar', () => {
  it('has a 2x memory multiplier', () => {
    expect(leastVisitedStar.memoryMultiplier).toBe(2)
  })

  it('prefers a neighbor visited fewer times over ones visited more', () => {
    const graph = hubGraph()
    // a visited twice, b visited once, c never visited — c should always win.
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub', 'a', 'hub', 'b', 'hub'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    for (let i = 0; i < 100; i++) {
      expect(leastVisitedStar.chooseNextNode(ctx)).toBe('c')
    }
  })

  it('breaks ties randomly among equally-least-visited neighbors', () => {
    const graph = hubGraph()
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub'] } // a visited once, b and c never
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(leastVisitedStar.chooseNextNode(ctx))
    expect(seen).toEqual(new Set(['b', 'c']))
  })

  it('excludes a node claimed by another walker (Traffic Control), even if it is least-visited', () => {
    const graph = hubGraph()
    // a visited twice, c visited once (and is the node just left), b never visited — b should win
    // over a even though c is claimed by another walker and so can't be the one to prove it.
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub', 'a', 'hub', 'c', 'hub'] }
    const ctx: StrategyContext = {
      graph,
      discovery: createDiscovery(graph, 'hub'),
      walker,
      memory: undefined,
      memoryLevel: 0,
      excludedNodeIds: new Set(['c']),
    }

    expect(leastVisitedStar.chooseNextNode(ctx)).toBe('b')
  })

  it('respects Node Memory filtering before scoring by visit count', () => {
    const graph = hubGraph()
    // c is the least-visited (0 times) but remembered (most recent step) — should be excluded.
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub', 'a', 'hub', 'b', 'hub', 'c', 'hub'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 1 }

    expect(leastVisitedStar.chooseNextNode(ctx)).toBe('b')
  })
})
