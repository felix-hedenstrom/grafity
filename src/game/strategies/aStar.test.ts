import { describe, expect, it } from 'vitest'
import { createDiscovery } from '../discovery/reveal'
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

describe('aStar', () => {
  it('has a 1x memory multiplier', () => {
    expect(aStar.memoryMultiplier).toBe(1)
  })

  it('heads toward the actual exit, not just whatever is nearest unexplored', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const ctx: StrategyContext = { graph, discovery: createDiscovery(graph, 'hub'), walker, memory: undefined, memoryLevel: 0 }

    // Both routes tie on weight, but 'near' is laid out close to the goal — the heuristic should favor it.
    expect(aStar.chooseNextNode(ctx)).toBe('near')
  })

  it('getHighlightedNodes returns the full planned route to the goal', () => {
    const graph = positionedForkGraph()
    const walker = createWalker('hub')
    const discovery = createDiscovery(graph, 'hub')
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(aStar.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'path', nodeIds: new Set(['hub', 'near', 'goal']) }])
  })

  it('getHighlightedNodes falls back to just the current node if the goal is unreachable', () => {
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
    const discovery = createDiscovery(graph, 'a')
    const ctx: StrategyContext = { graph, discovery, walker, memory: undefined, memoryLevel: 0 }

    expect(aStar.getHighlightedNodes?.(ctx)).toEqual([{ kind: 'path', nodeIds: new Set(['a']) }])
  })
})
