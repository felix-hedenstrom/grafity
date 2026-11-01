import { describe, expect, it } from 'vitest'
import { createDiscovery, revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { runBidirectionalTick } from './bidirectionalTick'

function chainGraph(): Graph {
  // a - b - c - d - e, start 'a', exit 'e'
  const adjacency = { a: ['b'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'e'], e: ['d'] }
  const edges = [
    { id: 'a--b', source: 'a', target: 'b', weight: 1 },
    { id: 'b--c', source: 'b', target: 'c', weight: 1 },
    { id: 'c--d', source: 'c', target: 'd', weight: 1 },
    { id: 'd--e', source: 'd', target: 'e', weight: 1 },
  ]
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'e' })),
    edges,
    startNodeId: 'a',
    goalNodeId: 'e',
    adjacency,
  }
}

/** Both starting positions need to be pre-visited, same as the real game reveals around both start and goal when bidirectional search begins — otherwise a walker's own position looks "unvisited" to itself. */
function startAndGoalDiscovery(graph: Graph): DiscoveryState {
  return revealAroundNode(createDiscovery(graph, graph.startNodeId), graph, graph.goalNodeId).discovery
}

describe('runBidirectionalTick', () => {
  it('steps both walkers one hop each, toward each other', () => {
    const graph = chainGraph()
    const walker = createWalker('a')
    const walker2 = createWalker('e')
    const discovery = startAndGoalDiscovery(graph)

    const result = runBidirectionalTick({ graph, walker, walker2, discovery })

    expect(result.walker.currentNodeId).toBe('b')
    expect(result.walker2.currentNodeId).toBe('d')
    expect(result.met).toBe(false)
  })

  it('declares met once the two become adjacent, with a bonus on top of discovery rewards', () => {
    const graph = chainGraph()
    // One more tick from b/d should land them on c from both sides — met.
    const walker = { ...createWalker('a'), currentNodeId: 'b', path: ['a', 'b'] }
    const walker2 = { ...createWalker('e'), currentNodeId: 'd', path: ['e', 'd'] }
    const discovery = {
      discoveredNodeIds: new Set(['a', 'b', 'c', 'd', 'e']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['a', 'b', 'd', 'e']),
    }

    const result = runBidirectionalTick({ graph, walker, walker2, discovery })

    expect(result.met).toBe(true)
    expect(result.currencyEarned).toBeGreaterThan(0)
  })

  it('is a no-op once already met', () => {
    const graph = chainGraph()
    const walker = { ...createWalker('a'), currentNodeId: 'c', path: ['a', 'b', 'c'] }
    const walker2 = { ...createWalker('e'), currentNodeId: 'c', path: ['e', 'd', 'c'] }
    const discovery = createDiscovery(graph, 'a')

    const result = runBidirectionalTick({ graph, walker, walker2, discovery })

    expect(result).toEqual({ walker, walker2, discovery, met: true, currencyEarned: 0 })
  })

  it('shares one discovery state, so a node either walker visits stays visited for both', () => {
    const graph = chainGraph()
    const walker = createWalker('a')
    const walker2 = createWalker('e')
    const discovery = startAndGoalDiscovery(graph)

    const result = runBidirectionalTick({ graph, walker, walker2, discovery })

    expect(result.discovery.visitedNodeIds.has('b')).toBe(true) // walker's new position
    expect(result.discovery.visitedNodeIds.has('d')).toBe(true) // walker2's new position
  })
})
