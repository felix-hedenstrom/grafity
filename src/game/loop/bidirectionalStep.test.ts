import { describe, expect, it } from 'vitest'
import { createDiscovery, revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { commitBidirectionalHop, decideBidirectionalHop, hasMet } from './bidirectionalStep'

function chainGraph(): Graph {
  // a - b - c - d - e, start 'a', exit 'e', evenly spaced one unit apart
  const adjacency = { a: ['b'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'e'], e: ['d'] }
  const positions: Record<string, { x: number; y: number }> = {
    a: { x: 0, y: 0 },
    b: { x: 1, y: 0 },
    c: { x: 2, y: 0 },
    d: { x: 3, y: 0 },
    e: { x: 4, y: 0 },
  }
  const edges = [
    { id: 'a--b', source: 'a', target: 'b' },
    { id: 'b--c', source: 'b', target: 'c' },
    { id: 'c--d', source: 'c', target: 'd' },
    { id: 'd--e', source: 'd', target: 'e' },
  ]
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'a', isGoal: id === 'e', ...positions[id] })),
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

describe('decideBidirectionalHop', () => {
  it('picks the nearest unvisited node from this walker\'s side', () => {
    const graph = chainGraph()
    const discovery = startAndGoalDiscovery(graph)

    expect(decideBidirectionalHop(graph, discovery, createWalker('a'))).toBe('b')
    expect(decideBidirectionalHop(graph, discovery, createWalker('e'))).toBe('d')
  })

  it('returns null once nothing unvisited is reachable from this walker\'s side', () => {
    const graph = chainGraph()
    const discovery = {
      discoveredNodeIds: new Set(['a', 'b', 'c', 'd', 'e']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['a', 'b', 'c', 'd', 'e']),
    }

    expect(decideBidirectionalHop(graph, discovery, createWalker('a'))).toBeNull()
  })
})

describe('hasMet', () => {
  it('is true once the two walkers are adjacent', () => {
    const graph = chainGraph()
    const walker = { ...createWalker('a'), currentNodeId: 'b', path: ['a', 'b'] }
    const walker2 = { ...createWalker('e'), currentNodeId: 'c', path: ['e', 'd', 'c'] }

    expect(hasMet(graph, walker, walker2)).toBe(true)
  })

  it('is false while still apart', () => {
    const graph = chainGraph()
    expect(hasMet(graph, createWalker('a'), createWalker('e'))).toBe(false)
  })
})

describe('commitBidirectionalHop', () => {
  it('moves the walker and reveals around the new node, sharing one discovery state', () => {
    const graph = chainGraph()
    const discovery = startAndGoalDiscovery(graph)

    const result = commitBidirectionalHop({ graph, discovery, walker: createWalker('a'), nextNodeId: 'b' })

    expect(result.walker.currentNodeId).toBe('b')
    expect(result.discovery.visitedNodeIds.has('b')).toBe(true)
    expect(result.currencyEarned).toBeGreaterThan(0)
  })

  it('awards only the tiny revisit reward when stepping onto an already-visited node', () => {
    const graph = chainGraph()
    const discovery = startAndGoalDiscovery(graph)

    const result = commitBidirectionalHop({ graph, discovery, walker: createWalker('a'), nextNodeId: 'a' })

    expect(result.wasAlreadyVisited).toBe(true)
  })

  it('uses custom rewardRates when supplied', () => {
    const graph = chainGraph()
    const discovery = startAndGoalDiscovery(graph)
    const customRates = { discoveryPerNode: 100, revisit: 50, goalPerNode: 1000 }

    const result = commitBidirectionalHop({ graph, discovery, walker: createWalker('a'), nextNodeId: 'b', rewardRates: customRates })

    expect(result.currencyEarned).toBe(customRates.discoveryPerNode)
  })
})
