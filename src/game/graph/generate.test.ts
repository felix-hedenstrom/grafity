import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { generateGraph } from './generate'
import type { NodeId } from './types'

function reachableFrom(start: NodeId, adjacency: Record<NodeId, NodeId[]>): Set<NodeId> {
  const visited = new Set<NodeId>([start])
  const queue: NodeId[] = [start]
  while (queue.length > 0) {
    const current = queue.shift() as NodeId
    for (const neighbor of adjacency[current]) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      queue.push(neighbor)
    }
  }
  return visited
}

describe('generateGraph', () => {
  it('produces a fully connected graph for various sizes and seeds', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      for (const nodeCount of [2, 3, 5, 10, 30]) {
        const graph = generateGraph(nodeCount, mulberry32(seed))
        const reachable = reachableFrom(graph.startNodeId, graph.adjacency)
        expect(reachable.size).toBe(nodeCount)
      }
    }
  })

  it('never places the goal node adjacent-only trivially at start, and start != goal', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const graph = generateGraph(20, mulberry32(seed))
      expect(graph.goalNodeId).not.toBe(graph.startNodeId)
    }
  })

  it('marks exactly one start node and one goal node', () => {
    const graph = generateGraph(15, mulberry32(7))
    const startNodes = graph.nodes.filter((n) => n.isStart)
    const goalNodes = graph.nodes.filter((n) => n.isGoal)
    expect(startNodes).toHaveLength(1)
    expect(goalNodes).toHaveLength(1)
    expect(startNodes[0].id).toBe(graph.startNodeId)
    expect(goalNodes[0].id).toBe(graph.goalNodeId)
  })

  it('has symmetric adjacency matching the edge list', () => {
    const graph = generateGraph(12, mulberry32(99))
    for (const edge of graph.edges) {
      expect(graph.adjacency[edge.source]).toContain(edge.target)
      expect(graph.adjacency[edge.target]).toContain(edge.source)
    }
  })

  it('throws for fewer than 2 nodes', () => {
    expect(() => generateGraph(1)).toThrow()
    expect(() => generateGraph(0)).toThrow()
  })

  it('assigns each edge a weight in range, and not all the same (so weighted search has something to be smarter about)', () => {
    const graph = generateGraph(30, mulberry32(5))
    const weights = graph.edges.map((e) => e.weight)
    for (const w of weights) {
      expect(w).toBeGreaterThanOrEqual(1)
      expect(w).toBeLessThanOrEqual(9)
      expect(Number.isInteger(w)).toBe(true)
    }
    expect(new Set(weights).size).toBeGreaterThan(1)
  })
})
