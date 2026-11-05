import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { compass } from './compass'
import type { StrategyContext } from './types'

function detourGraph(): Graph {
  // Two routes to the goal: hub -- lure -- goal looks shorter as the crow flies (lure sits right
  // next to the goal) but its edges are enormously long; hub -- plain -- goal is the genuinely
  // cheaper weighted route but starts by heading away from the goal. Greedy best-first must fall
  // for the lure; a cost-aware search (Dijkstra/A*) would take 'plain'.
  const adjacency = { hub: ['lure', 'plain'], lure: ['hub', 'goal'], plain: ['hub', 'goal'], goal: ['lure', 'plain'] }
  // lure sits 30 from the goal as the crow flies but its route costs ≈ 104.4 + 30 ≈ 134.4;
  // plain sits 67 away yet its route costs only 50 + 67.1 ≈ 117.1 — the cheaper route. A* / Dijkstra
  // take plain (f = 117.1 < 134.4); greedy best-first orders purely by the heuristic (30 < 67) and
  // dives for the lure.
  const positions: Record<string, { x: number; y: number }> = {
    hub: { x: 0, y: 0 },
    lure: { x: 100, y: 30 },
    plain: { x: 40, y: -30 },
    goal: { x: 100, y: 0 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'goal', ...positions[id] })),
    edges: [
      { id: 'hub--lure', source: 'hub', target: 'lure' },
      { id: 'lure--goal', source: 'lure', target: 'goal' },
      { id: 'hub--plain', source: 'hub', target: 'plain' },
      { id: 'plain--goal', source: 'plain', target: 'goal' },
    ],
    startNodeId: 'hub',
    goalNodeId: 'goal',
    adjacency,
  }
}

function fullDiscovery(graph: Graph, visited: string[]): DiscoveryState {
  return {
    discoveredNodeIds: new Set(graph.nodes.map((n) => n.id)),
    discoveredEdgeIds: new Set(graph.edges.map((e) => e.id)),
    visitedNodeIds: new Set(visited),
  }
}

describe('compass', () => {
  it('has a 2x memory multiplier', () => {
    expect(compass.memoryMultiplier).toBe(2)
  })

  it('chases straight-line closeness to the known goal, ignoring real edge costs entirely', () => {
    const graph = detourGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = { graph, discovery: fullDiscovery(graph, ['hub']), walker, memory: undefined, memoryLevel: 0 }

    // 'lure' sits nearly on top of the goal, so greedy best-first dives for it even though the
    // route through 'plain' is genuinely cheaper in real distance.
    expect(compass.chooseNextNode(ctx)).toBe('lure')
  })

  it('behaves like BFS toward the nearest frontier while the goal is still unknown', () => {
    const graph = detourGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub') // goal not discovered yet
    expect(discovery.discoveredNodeIds.has('goal')).toBe(false)

    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }
    expect(['lure', 'plain']).toContain(compass.chooseNextNode(ctx))
  })

  it('getHighlightedNodes shows the greedy route once the goal is known', () => {
    const graph = detourGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = { graph, discovery: fullDiscovery(graph, ['hub']), walker, memory: undefined, memoryLevel: 0 }

    expect(compass.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'path', nodeIds: new Set(['hub', 'lure', 'goal']) }])
  })
})
