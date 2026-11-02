import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { leastVisitedPath } from './leastVisitedPath'
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

/** hub connects to a/b/c directly; a also connects onward to x — lets a path revisit node x via the a-x edge specifically, distinct from however often x or hub were visited overall. */
function forkGraph(): Graph {
  const adjacency = { hub: ['a', 'b', 'c'], a: ['hub', 'x'], b: ['hub'], c: ['hub'], x: ['a'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: false })),
    edges: [],
    startNodeId: 'hub',
    goalNodeId: 'none',
    adjacency,
  }
}

describe('leastVisitedPath', () => {
  it('has a 2x memory multiplier', () => {
    expect(leastVisitedPath.memoryMultiplier).toBe(2)
  })

  it('prefers a neighbor whose connecting edge was crossed fewer times', () => {
    const graph = hubGraph()
    // hub-a crossed twice, hub-b crossed once, hub-c never crossed — c should always win.
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub', 'a', 'hub', 'b', 'hub'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    for (let i = 0; i < 100; i++) {
      expect(leastVisitedPath.chooseNextNode(ctx)).toBe('c')
    }
  })

  it('tracks the specific edge crossed, not the node landed on — can disagree with node-level visit counts', () => {
    const graph = forkGraph()
    // hub visited 3 times total but reached from 'a' only once (hub-a crossed once).
    // x visited only once total but the a-x edge has been crossed twice (there and back).
    // A node-level count would favor x (1 visit) over hub (3 visits); the edge-level
    // count must favor hub (1 crossing) over x (2 crossings) instead.
    const walker = { ...createWalker('hub'), currentNodeId: 'a', path: ['hub', 'b', 'hub', 'c', 'hub', 'a', 'x', 'a'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    expect(leastVisitedPath.chooseNextNode(ctx)).toBe('hub')
  })

  it('breaks ties randomly among equally-least-crossed edges', () => {
    const graph = hubGraph()
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub'] } // hub-a crossed twice, hub-b and hub-c never
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(leastVisitedPath.chooseNextNode(ctx))
    expect(seen).toEqual(new Set(['b', 'c']))
  })

  it('respects Node Memory filtering before scoring by edge-crossing count', () => {
    const graph = hubGraph()
    // hub-c is the least-crossed edge (0 times) but c is remembered (most recent step) — should be excluded.
    const walker = { ...createWalker('hub'), path: ['hub', 'a', 'hub', 'a', 'hub', 'b', 'hub', 'c', 'hub'] }
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 1 }

    expect(leastVisitedPath.chooseNextNode(ctx)).toBe('b')
  })
})
