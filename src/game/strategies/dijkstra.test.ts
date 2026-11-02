import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { dijkstra } from './dijkstra'
import type { StrategyContext } from './types'

function weightedForkGraph(): Graph {
  // hub -(1)- cheap -(1)- goal, laid out on a short straight line
  // hub -(20)- pricey -(~20.1)- goal, laid out via a node far off to the side
  const adjacency = { hub: ['cheap', 'pricey'], cheap: ['hub', 'goal'], pricey: ['hub', 'goal'], goal: ['cheap', 'pricey'] }
  const positions: Record<string, { x: number; y: number }> = {
    hub: { x: 0, y: 0 },
    cheap: { x: 1, y: 0 },
    goal: { x: 2, y: 0 },
    pricey: { x: 0, y: 20 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'goal', ...positions[id] })),
    edges: [
      { id: 'hub--cheap', source: 'hub', target: 'cheap' },
      { id: 'cheap--goal', source: 'cheap', target: 'goal' },
      { id: 'hub--pricey', source: 'hub', target: 'pricey' },
      { id: 'pricey--goal', source: 'pricey', target: 'goal' },
    ],
    startNodeId: 'hub',
    goalNodeId: 'goal',
    adjacency,
  }
}

describe('dijkstra', () => {
  it('has a 1x memory multiplier', () => {
    expect(dijkstra.memoryMultiplier).toBe(1)
  })

  it('prefers the cheaper-weight route over the fewer-hops-but-pricier one', () => {
    const graph = weightedForkGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    // 'cheap' and 'pricey' are both 1 hop away and unvisited, but Dijkstra should prefer 'cheap'
    // because the overall route through it (weight 1) is far less costly than through 'pricey' (weight 20).
    expect(dijkstra.chooseNextNode(ctx)).toBe('cheap')
  })

  it('routes around a node excluded by Traffic Control, even if it is the cheaper route', () => {
    const graph = weightedForkGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = {
      graph,
      discovery: createDiscovery(graph, 'hub'),
      walker,
      memory: undefined,
      memoryLevel: 0,
      excludedNodeIds: new Set(['cheap']),
    }

    // 'cheap' would normally win, but it's claimed by another walker — Dijkstra must go via 'pricey'.
    expect(dijkstra.chooseNextNode(ctx)).toBe('pricey')
  })

  it('getHighlightedNodes returns discovered-but-unvisited nodes as the frontier', () => {
    const graph = weightedForkGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub')
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(dijkstra.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'frontier', nodeIds: new Set(['cheap', 'pricey']) }])
  })
})
