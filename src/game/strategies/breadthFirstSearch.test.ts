import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { breadthFirstSearch } from './breadthFirstSearch'
import type { StrategyContext } from './types'

function branchingGraph(): Graph {
  // hub -- near -- far, plus hub -- side (a short detour that BFS should ignore since it only counts hops)
  const adjacency = { hub: ['near', 'side'], near: ['hub', 'far'], far: ['near'], side: ['hub'] }
  const positions: Record<string, { x: number; y: number }> = {
    hub: { x: 0, y: 0 },
    near: { x: 9, y: 0 },
    far: { x: 18, y: 0 },
    side: { x: 1, y: 0 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'far', ...positions[id] })),
    edges: [
      { id: 'hub--near', source: 'hub', target: 'near' },
      { id: 'near--far', source: 'near', target: 'far' },
      { id: 'hub--side', source: 'hub', target: 'side' },
    ],
    startNodeId: 'hub',
    goalNodeId: 'far',
    adjacency,
  }
}

describe('breadthFirstSearch', () => {
  it('has a 2x memory multiplier', () => {
    expect(breadthFirstSearch.memoryMultiplier).toBe(2)
  })

  it('heads toward the nearest unvisited node by hop count, ignoring edge weight', () => {
    const graph = branchingGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    // Both 'near' and 'side' are 1 hop away and unvisited — either is a valid BFS choice.
    const next = breadthFirstSearch.chooseNextNode(ctx)
    expect(['near', 'side']).toContain(next)
  })

  it('plans a multi-hop route toward the only remaining unvisited node, one step at a time', () => {
    const graph = branchingGraph()
    // hub, side, and near are all visited; only 'far' (2 hops from hub) is not.
    const walker = { ...createWalker('hub'), path: ['side', 'hub', 'near', 'hub'] }
    const discovery = {
      discoveredNodeIds: new Set(['hub', 'near', 'side', 'far']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(['hub', 'near', 'side']),
    }

    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }
    // First step must head toward 'near' (the only route to 'far'), not 'side' (a dead end for this goal).
    expect(breadthFirstSearch.chooseNextNode(ctx)).toBe('near')
  })

  it('routes around a node excluded by Traffic Control', () => {
    const graph = branchingGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = {
      graph,
      discovery: createDiscovery(graph, 'hub'),
      walker,
      memory: undefined,
      memoryLevel: 0,
      excludedNodeIds: new Set(['near']),
    }

    // 'near' is 1 hop away but claimed by another walker — BFS must route via 'side' instead.
    expect(breadthFirstSearch.chooseNextNode(ctx)).toBe('side')
  })

  it('cannot route through a visited corridor it has forgotten, settling for a frontier it still remembers the way to', () => {
    // Y-shaped territory: an 'a' arm (a1, with frontier fa behind it) and a long 'b' arm
    // (b1..b8, with frontier fb off b2). The walker wandered down the b arm and back, so with no
    // Node Memory the a1 visit has fallen out of the planning window — fa (2 hops, nearer) is
    // unreachable and BFS must settle for fb (3 hops) through remembered territory.
    const adjacency: Record<string, string[]> = {
      a1: ['c', 'fa'],
      fa: ['a1'],
      c: ['a1', 'b1'],
      b1: ['c', 'b2'],
      b2: ['b1', 'b3', 'fb'],
      fb: ['b2'],
      b3: ['b2', 'b4'],
      b4: ['b3', 'b5'],
      b5: ['b4', 'b6'],
      b6: ['b5', 'b7'],
      b7: ['b6', 'b8'],
      b8: ['b7'],
    }
    // pathfinding builds its weighted adjacency from graph.edges, so they must mirror `adjacency`.
    const edges = Object.entries(adjacency).flatMap(([source, targets]) =>
      targets.filter((target) => source < target).map((target) => ({ id: `${source}--${target}`, source, target })),
    )
    const graph: Graph = {
      nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'c', isGoal: false, x: 0, y: 0 })),
      edges,
      startNodeId: 'c',
      goalNodeId: 'none',
      adjacency,
    }
    const visited = ['a1', 'c', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']
    const discovery = {
      discoveredNodeIds: new Set([...visited, 'fa', 'fb']),
      discoveredEdgeIds: new Set<string>(),
      visitedNodeIds: new Set(visited),
    }
    const path = ['a1', 'c', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b7', 'b6', 'b5', 'b4', 'b3', 'b2', 'b1', 'c']
    const walker = { ...createWalker('c'), path }

    // Zero memory: a1 is forgotten, so the nearer frontier fa can't be planned to — heads for fb via b1.
    expect(breadthFirstSearch.chooseNextNode({ graph, discovery, walker, memory: undefined, memoryLevel: 0 })).toBe('b1')
    // Plenty of memory: the full corridor is remembered and the genuinely nearest frontier fa wins.
    expect(breadthFirstSearch.chooseNextNode({ graph, discovery, walker, memory: undefined, memoryLevel: 20 })).toBe('a1')
  })

  it('getHighlightedNodes returns discovered-but-unvisited nodes as the frontier', () => {
    const graph = branchingGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub') // reveals hub (visited) + near, side (discovered only)
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(breadthFirstSearch.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'frontier', nodeIds: new Set(['near', 'side']) }])
  })
})
