import { describe, expect, it } from 'vitest'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import { createWalker } from '../walker/walkerLogic'
import { pheromone } from './pheromone'
import type { StrategyContext } from './types'

/** hub with two one-hop spokes 'a' and 'b' — symmetric, so only trails can break the tie. */
function spokeGraph(): Graph {
  const adjacency = { hub: ['a', 'b'], a: ['hub'], b: ['hub'] }
  return {
    nodes: Object.keys(adjacency).map((id) => ({ id, isStart: id === 'hub', isGoal: false, x: 0, y: 0 })),
    edges: [
      { id: 'a--hub', source: 'hub', target: 'a' },
      { id: 'b--hub', source: 'hub', target: 'b' },
    ],
    startNodeId: 'hub',
    goalNodeId: 'none',
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

function ctxAt(graph: Graph, nodeId: string, sharedMemory: unknown, visited: string[]): StrategyContext {
  return {
    graph,
    discovery: fullDiscovery(graph, visited),
    walker: createWalker(nodeId),
    memory: undefined,
    memoryLevel: 0,
    walkerIndex: 0,
    sharedMemory,
  }
}

describe('pheromone', () => {
  it('has a 1.5x memory multiplier', () => {
    expect(pheromone.memoryMultiplier).toBe(1.5)
  })

  it('avoids the edge with the heavier trail', () => {
    const graph = spokeGraph()
    const memory = pheromone.createSharedMemory?.() as { tick: number; trails: Record<string, { amount: number; tick: number }> }
    // A fresh, strong trail toward 'a' — everything visited, so only trails differentiate.
    memory.trails['a--hub'] = { amount: 5, tick: 0 }

    expect(pheromone.chooseNextNode(ctxAt(graph, 'hub', memory, ['hub', 'a', 'b']))).toBe('b')
  })

  it('an old trail decays away — a node trailed long ago beats one trailed just now', () => {
    const graph = spokeGraph()
    const memory = pheromone.createSharedMemory?.() as { tick: number; trails: Record<string, { amount: number; tick: number }> }
    memory.tick = 500
    memory.trails['a--hub'] = { amount: 5, tick: 0 } // effectively ~0 after 500 decisions of decay
    memory.trails['b--hub'] = { amount: 1, tick: 500 } // fresh

    expect(pheromone.chooseNextNode(ctxAt(graph, 'hub', memory, ['hub', 'a', 'b']))).toBe('a')
  })

  it('prefers an unvisited neighbor over any visited one, trails notwithstanding', () => {
    const graph = spokeGraph()
    const memory = pheromone.createSharedMemory?.()
    // 'b' is still unvisited; 'a' is visited and untrailed — exploration beats trail math.
    expect(pheromone.chooseNextNode(ctxAt(graph, 'hub', memory, ['hub', 'a']))).toBe('b')
  })

  it("deposits on the chosen edge so a second walker sees the first one's trail", () => {
    const graph = spokeGraph()
    const memory = pheromone.createSharedMemory?.()

    // Walker 0 at hub, everything visited and untrailed: it picks some spoke and trails that edge.
    const first = pheromone.chooseNextNode(ctxAt(graph, 'hub', memory, ['hub', 'a', 'b']))
    // A different walker deciding from the same shared memory must now take the OTHER spoke.
    const second = pheromone.chooseNextNode({ ...ctxAt(graph, 'hub', memory, ['hub', 'a', 'b']), walkerIndex: 1 })

    expect(second).not.toBe(first)
  })

  it('falls back to a plain random neighbor if the shared memory is missing entirely', () => {
    const graph = spokeGraph()
    expect(['a', 'b']).toContain(pheromone.chooseNextNode(ctxAt(graph, 'hub', undefined, ['hub', 'a', 'b'])))
  })
})
