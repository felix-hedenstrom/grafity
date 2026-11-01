import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { breadthFirstSearch } from './breadthFirstSearch'
import type { StrategyContext } from './types'

function branchingGraph(): Graph {
  // hub -- near -- far, plus hub -- side (a cheap-weight detour that BFS should ignore since it only counts hops)
  const adjacency = { hub: ['near', 'side'], near: ['hub', 'far'], far: ['near'], side: ['hub'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'far' })),
    edges: [
      { id: 'hub--near', source: 'hub', target: 'near', weight: 9 },
      { id: 'near--far', source: 'near', target: 'far', weight: 9 },
      { id: 'hub--side', source: 'hub', target: 'side', weight: 1 },
    ],
    startNodeId: 'hub',
    goalNodeId: 'far',
    adjacency,
  }
}

describe('breadthFirstSearch', () => {
  it('has a 1x memory multiplier', () => {
    expect(breadthFirstSearch.memoryMultiplier).toBe(1)
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

  it('getHighlightedNodes returns discovered-but-unvisited nodes as the frontier', () => {
    const graph = branchingGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub') // reveals hub (visited) + near, side (discovered only)
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(breadthFirstSearch.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'frontier', nodeIds: new Set(['near', 'side']) }])
  })
})
