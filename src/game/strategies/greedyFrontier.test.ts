import { describe, expect, it } from 'vitest'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { greedyFrontier } from './greedyFrontier'
import type { StrategyContext } from './types'

function frontierGraph(): Graph {
  const adjacency = {
    current: ['a', 'b'],
    a: ['current', 'x1', 'x2', 'x3'],
    b: ['current', 'y1'],
    x1: ['a'],
    x2: ['a'],
    x3: ['a'],
    y1: ['b'],
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'current', isGoal: false })),
    edges: [],
    startNodeId: 'current',
    goalNodeId: 'none',
    adjacency,
  }
}

function discoveryOf(ids: string[]): DiscoveryState {
  return {
    discoveredNodeIds: new Set(ids),
    discoveredEdgeIds: new Set(),
    visitedNodeIds: new Set(ids),
  }
}

describe('greedyFrontier', () => {
  it('prefers the neighbor that opens up the most undiscovered territory', () => {
    const graph = frontierGraph()
    const walker = createWalker('current')
    const discovery = discoveryOf(['current', 'a', 'b']) // x1-x3 and y1 still undiscovered
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    for (let i = 0; i < 50; i++) {
      expect(greedyFrontier.chooseNextNode(ctx)).toBe('a')
    }
  })

  it('getHighlightedNodes returns the same candidates chooseNextNode picks among, plus the remembered window', () => {
    const graph = frontierGraph()
    const walker = { ...createWalker('current'), path: ['b', 'current'] }
    const discovery = discoveryOf(['current', 'a', 'b']) // x1-x3 and y1 still undiscovered
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 1 }

    expect(greedyFrontier.getHighlightedNodes?.(ctx)).toEqual([
      { kind: 'remembered', nodeIds: new Set(['b']) },
      { kind: 'candidate', nodeIds: new Set(['a']) },
    ])
  })

  it('breaks ties randomly among equally good neighbors', () => {
    const graph = frontierGraph()
    const walker = createWalker('current')
    // Discover away a's and b's extra neighbors so both score 0 — a tie.
    const discovery = discoveryOf(['current', 'a', 'b', 'x1', 'x2', 'x3', 'y1'])
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(greedyFrontier.chooseNextNode(ctx))
    }
    expect(seen).toEqual(new Set(['a', 'b']))
  })

  it('excludes a remembered neighbor from scoring entirely, even if it would otherwise win', () => {
    const graph = frontierGraph()
    // 'a' is the best neighbor (opens up 3 undiscovered nodes vs b's 1), but it's remembered.
    const walker = { ...createWalker('current'), path: ['a', 'current'] }
    const discovery = discoveryOf(['current', 'a', 'b'])
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 1 }

    expect(greedyFrontier.chooseNextNode(ctx)).toBe('b')
  })
})
