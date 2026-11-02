import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { aStar } from './aStar'
import type { StrategyContext } from './types'

function positionedForkGraph(): Graph {
  // hub -(1)- near (close to goal in space) -(1)- goal
  // hub -(1)- far (laid out away from goal) -(1)- goal
  const adjacency = { hub: ['near', 'far'], near: ['hub', 'goal'], far: ['hub', 'goal'], goal: ['near', 'far'] }
  const positions: Record<string, { x: number; y: number }> = {
    hub: { x: 0, y: 0 },
    near: { x: 10, y: 0 },
    far: { x: -100, y: 100 },
    goal: { x: 20, y: 0 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'goal', ...positions[id] })),
    edges: [
      { id: 'hub--near', source: 'hub', target: 'near', weight: 1 },
      { id: 'near--goal', source: 'near', target: 'goal', weight: 1 },
      { id: 'hub--far', source: 'hub', target: 'far', weight: 1 },
      { id: 'far--goal', source: 'far', target: 'goal', weight: 1 },
    ],
    startNodeId: 'hub',
    goalNodeId: 'goal',
    adjacency,
  }
}

/** Reveals the goal too, as if the walker had already seen it — createDiscovery alone only reveals hub's immediate neighbors. */
function discoveryWithGoalKnown(graph: Graph, visited: string[] = ['hub']): DiscoveryState {
  return {
    discoveredNodeIds: new Set(graph.nodes.map((n) => n.id)),
    discoveredEdgeIds: new Set(graph.edges.map((e) => e.id)),
    visitedNodeIds: new Set(visited),
  }
}

describe('aStar', () => {
  it('has a 1x memory multiplier', () => {
    expect(aStar.memoryMultiplier).toBe(1)
  })

  it('does not know where the goal is until it has actually discovered it — no beeline, behaves like Dijkstra', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub') // reveals hub + near + far only
    expect(discovery.discoveredNodeIds.has('goal')).toBe(false)

    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }
    // Both 'near' and 'far' are discovered, unvisited, and tie on edge weight — without having
    // actually seen the goal, A* has no legitimate reason to prefer 'near' just because it happens
    // to be laid out closer to it.
    expect(['near', 'far']).toContain(aStar.chooseNextNode(ctx))
  })

  it('beelines for the actual exit using the layout heuristic once it has actually been discovered', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const discovery = discoveryWithGoalKnown(graph)
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    // Both routes tie on weight, but 'near' is laid out close to the goal — the heuristic should favor it.
    expect(aStar.chooseNextNode(ctx)).toBe('near')
  })

  it('never plans a route through a node it has not discovered, even once the goal itself is known', () => {
    // hub -- a (discovered) -- b (undiscovered) -- goal (discovered) — the only route to the known
    // goal passes through fog, so A* must not be able to use it at all.
    const adjacency = { hub: ['a'], a: ['hub', 'b'], b: ['a', 'goal'], goal: ['b'] }
    const graph: Graph = {
      nodes: [
        { id: 'hub', isStart: true, isGoal: false, x: 0, y: 0 },
        { id: 'a', isStart: false, isGoal: false, x: 10, y: 0 },
        { id: 'b', isStart: false, isGoal: false, x: 20, y: 0 },
        { id: 'goal', isStart: false, isGoal: true, x: 30, y: 0 },
      ],
      edges: [
        { id: 'hub--a', source: 'hub', target: 'a', weight: 1 },
        { id: 'a--b', source: 'a', target: 'b', weight: 1 },
        { id: 'b--goal', source: 'b', target: 'goal', weight: 1 },
      ],
      startNodeId: 'hub',
      goalNodeId: 'goal',
      adjacency,
    }
    const walker = createWalker('hub')
    const discovery: DiscoveryState = {
      discoveredNodeIds: new Set(['hub', 'a', 'goal']), // 'b' deliberately left undiscovered
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['hub']),
    }
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    // The only legal next step is 'a' — the route through undiscovered 'b' can't be planned, even
    // though the true graph puts the goal just two hops away via it.
    expect(aStar.chooseNextNode(ctx)).toBe('a')
  })

  it('getHighlightedNodes shows the discovered frontier while the goal is still unknown', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub')
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(aStar.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'frontier', nodeIds: new Set(['near', 'far']) }])
  })

  it('getHighlightedNodes returns the full planned route once the goal is discovered', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const discovery = discoveryWithGoalKnown(graph)
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(aStar.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'path', nodeIds: new Set(['hub', 'near', 'goal']) }])
  })

  it('getHighlightedNodes falls back to just the current node if the discovered goal is unreachable', () => {
    const graph: Graph = {
      nodes: [
        { id: 'a', isStart: true, isGoal: false, x: 0, y: 0 },
        { id: 'b', isStart: false, isGoal: true, x: 5, y: 5 },
      ],
      edges: [],
      startNodeId: 'a',
      goalNodeId: 'b',
      adjacency: { a: [], b: [] },
    }
    const walker = createWalker('a')
    const discovery: DiscoveryState = {
      discoveredNodeIds: new Set(['a', 'b']), // goal "discovered" despite the graph being disconnected
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['a']),
    }
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(aStar.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'path', nodeIds: new Set(['a']) }])
  })
})
