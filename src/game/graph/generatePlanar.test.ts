import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { generatePlanarGraph } from './generatePlanar'
import type { NodeId } from './types'
import { getEdgeWeight } from './types'

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

/** Standard orientation-based proper segment intersection test — ignores shared endpoints, since edges meeting at a common node are expected and not a "crossing." */
function segmentsCross(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, p4: { x: number; y: number }): boolean {
  function orientation(a: typeof p1, b: typeof p1, c: typeof p1): number {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
    if (Math.abs(value) < 1e-9) return 0
    return value > 0 ? 1 : 2
  }
  function onSegment(a: typeof p1, b: typeof p1, c: typeof p1): boolean {
    return (
      Math.min(a.x, c.x) <= b.x && b.x <= Math.max(a.x, c.x) && Math.min(a.y, c.y) <= b.y && b.y <= Math.max(a.y, c.y)
    )
  }

  const o1 = orientation(p1, p2, p3)
  const o2 = orientation(p1, p2, p4)
  const o3 = orientation(p3, p4, p1)
  const o4 = orientation(p3, p4, p2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p1, p3, p2)) return true
  if (o2 === 0 && onSegment(p1, p4, p2)) return true
  if (o3 === 0 && onSegment(p3, p1, p4)) return true
  if (o4 === 0 && onSegment(p3, p2, p4)) return true
  return false
}

describe('generatePlanarGraph', () => {
  it('produces exactly nodeCount nodes, each with final x/y positions already set', () => {
    const graph = generatePlanarGraph(40, mulberry32(1))
    expect(graph.nodes).toHaveLength(40)
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it('produces a fully connected graph for various sizes and seeds', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      for (const nodeCount of [2, 3, 5, 10, 30]) {
        const graph = generatePlanarGraph(nodeCount, mulberry32(seed))
        const reachable = reachableFrom(graph.startNodeId, graph.adjacency)
        expect(reachable.size).toBe(nodeCount)
      }
    }
  })

  it('never produces two edges that cross each other, however the nodes end up arranged', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const graph = generatePlanarGraph(60, mulberry32(seed))
      const positionById = new Map(graph.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))

      for (let i = 0; i < graph.edges.length; i++) {
        for (let j = i + 1; j < graph.edges.length; j++) {
          const e1 = graph.edges[i]
          const e2 = graph.edges[j]
          // Edges sharing an endpoint meeting there is normal, not a crossing — skip those pairs.
          if (e1.source === e2.source || e1.source === e2.target || e1.target === e2.source || e1.target === e2.target) continue

          const crosses = segmentsCross(
            positionById.get(e1.source)!,
            positionById.get(e1.target)!,
            positionById.get(e2.source)!,
            positionById.get(e2.target)!,
          )
          expect(crosses).toBe(false)
        }
      }
    }
  })

  it('marks exactly one start node and one goal node, and they differ', () => {
    const graph = generatePlanarGraph(25, mulberry32(7))
    const startNodes = graph.nodes.filter((n) => n.isStart)
    const goalNodes = graph.nodes.filter((n) => n.isGoal)
    expect(startNodes).toHaveLength(1)
    expect(goalNodes).toHaveLength(1)
    expect(graph.startNodeId).not.toBe(graph.goalNodeId)
  })

  it('has symmetric adjacency matching the edge list', () => {
    const graph = generatePlanarGraph(20, mulberry32(99))
    for (const edge of graph.edges) {
      expect(graph.adjacency[edge.source]).toContain(edge.target)
      expect(graph.adjacency[edge.target]).toContain(edge.source)
    }
  })

  it('throws for fewer than 2 nodes', () => {
    expect(() => generatePlanarGraph(1)).toThrow()
    expect(() => generatePlanarGraph(0)).toThrow()
  })

  it('gives every edge a weight equal to the real Euclidean distance between its endpoints', () => {
    const graph = generatePlanarGraph(60, mulberry32(5))
    const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
    for (const edge of graph.edges) {
      const a = nodesById.get(edge.source)!
      const b = nodesById.get(edge.target)!
      const expected = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0))
      expect(getEdgeWeight(graph, edge.source, edge.target)).toBeCloseTo(expected)
    }
  })

  it('is deterministic for a given seed', () => {
    const a = generatePlanarGraph(30, mulberry32(77))
    const b = generatePlanarGraph(30, mulberry32(77))
    expect(a.edges.map((e) => e.id).sort()).toEqual(b.edges.map((e) => e.id).sort())
    expect(a.nodes.map((n) => n.x)).toEqual(b.nodes.map((n) => n.x))
  })
})
