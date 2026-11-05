import { describe, expect, it } from 'vitest'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { dijkstra } from './dijkstra'
import { swarmSearch } from './swarmSearch'
import type { StrategyContext } from './types'

/**
 * A hub with two corridors ending in frontier nodes at different distances:
 *   hub -- nearF (frontier, 10 away)
 *   hub -- mid -- farF (frontier, 10 + 10 away)
 */
function twoFrontierGraph(): Graph {
  const adjacency = { hub: ['nearF', 'mid'], nearF: ['hub'], mid: ['hub', 'farF'], farF: ['mid'] }
  const positions: Record<string, { x: number; y: number }> = {
    hub: { x: 0, y: 0 },
    nearF: { x: 10, y: 0 },
    mid: { x: 0, y: 10 },
    farF: { x: 0, y: 20 },
  }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: false, ...positions[id] })),
    edges: [
      { id: 'hub--nearF', source: 'hub', target: 'nearF' },
      { id: 'hub--mid', source: 'hub', target: 'mid' },
      { id: 'farF--mid', source: 'mid', target: 'farF' },
    ],
    startNodeId: 'hub',
    goalNodeId: 'none',
    adjacency,
  }
}

function discovery(graph: Graph, visited: string[]): DiscoveryState {
  return {
    discoveredNodeIds: new Set(graph.nodes.map((n) => n.id)),
    discoveredEdgeIds: new Set(graph.edges.map((e) => e.id)),
    visitedNodeIds: new Set(visited),
  }
}

function ctxFor(graph: Graph, visited: string[], walkerIndex: number, sharedMemory: unknown, path?: string[]): StrategyContext {
  const walker = createWalker('hub')
  return {
    graph,
    discovery: discovery(graph, visited),
    walker: path ? { ...walker, path } : walker,
    memory: undefined,
    memoryLevel: 0,
    walkerIndex,
    sharedMemory,
  }
}

describe('swarmSearch', () => {
  it('has a 3x memory multiplier', () => {
    expect(swarmSearch.memoryMultiplier).toBe(3)
  })

  it('with one walker, heads for the nearest frontier like Dijkstra', () => {
    const graph = twoFrontierGraph()
    const memory = swarmSearch.createSharedMemory?.()
    const ctx = ctxFor(graph, ['hub', 'mid'], 0, memory, ['mid', 'hub'])

    expect(swarmSearch.chooseNextNode(ctx)).toBe(dijkstra.chooseNextNode(ctx))
    expect(swarmSearch.chooseNextNode(ctx)).toBe('nearF')
  })

  it('two walkers claim different frontier targets instead of racing to the same one', () => {
    const graph = twoFrontierGraph()
    const memory = swarmSearch.createSharedMemory?.() as { assignments: Record<number, string> }
    const visited = ['hub', 'mid']

    // Walker 0 claims the nearest frontier...
    expect(swarmSearch.chooseNextNode(ctxFor(graph, visited, 0, memory, ['mid', 'hub']))).toBe('nearF')
    expect(memory.assignments[0]).toBe('nearF')
    // ...so walker 1, deciding from the same spot, must sweep toward the other one.
    expect(swarmSearch.chooseNextNode(ctxFor(graph, visited, 1, memory, ['mid', 'hub']))).toBe('mid')
    expect(memory.assignments[1]).toBe('farF')
  })

  it('drops a claim once its target has been visited by anyone', () => {
    const graph = twoFrontierGraph()
    const memory = swarmSearch.createSharedMemory?.() as { assignments: Record<number, string> }
    memory.assignments[0] = 'nearF'

    // nearF has since been visited — the stale claim is dropped and farF becomes the new target.
    swarmSearch.chooseNextNode(ctxFor(graph, ['hub', 'mid', 'nearF'], 0, memory, ['nearF', 'mid', 'hub']))
    expect(memory.assignments[0]).toBe('farF')
  })

  it('shares a frontier rather than stalling when other walkers have claimed everything', () => {
    const graph = twoFrontierGraph()
    const memory = swarmSearch.createSharedMemory?.() as { assignments: Record<number, string> }
    memory.assignments[1] = 'nearF'
    memory.assignments[2] = 'farF'

    expect(swarmSearch.chooseNextNode(ctxFor(graph, ['hub', 'mid'], 0, memory, ['mid', 'hub']))).toBe('nearF')
  })

  it('beelines for the target once it is discovered, dropping its claim', () => {
    const adjacency = { hub: ['frontierX', 'toGoal'], frontierX: ['hub'], toGoal: ['hub', 'goal'], goal: ['toGoal'] }
    const positions: Record<string, { x: number; y: number }> = {
      hub: { x: 0, y: 0 },
      frontierX: { x: 5, y: 0 },
      toGoal: { x: 0, y: 10 },
      goal: { x: 0, y: 20 },
    }
    const graph: Graph = {
      nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: id === 'goal', ...positions[id] })),
      edges: [
        { id: 'frontierX--hub', source: 'hub', target: 'frontierX' },
        { id: 'hub--toGoal', source: 'hub', target: 'toGoal' },
        { id: 'goal--toGoal', source: 'toGoal', target: 'goal' },
      ],
      startNodeId: 'hub',
      goalNodeId: 'goal',
      adjacency,
    }
    const memory = swarmSearch.createSharedMemory?.() as { assignments: Record<number, string> }
    memory.assignments[0] = 'frontierX'
    const ctx: StrategyContext = {
      graph,
      discovery: discovery(graph, ['hub', 'toGoal']),
      walker: { ...createWalker('hub'), path: ['toGoal', 'hub'] },
      memory: undefined,
      memoryLevel: 0,
      walkerIndex: 0,
      sharedMemory: memory,
    }

    // The goal is discovered and reachable — forget the frontier claim, beeline via toGoal.
    expect(swarmSearch.chooseNextNode(ctx)).toBe('toGoal')
    expect(memory.assignments[0]).toBeUndefined()
  })
})
