import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { generateGraph } from './generate'
import { computeGraphBounds, computeLayoutForces, computeViewBounds, layoutGraph } from './layout'

describe('layoutGraph', () => {
  it('assigns finite numeric x/y to every node, including ones that would start undiscovered', () => {
    const graph = layoutGraph(generateGraph(24, mulberry32(1)))
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.x)).toBe(true)
      expect(Number.isFinite(node.y)).toBe(true)
    }
  })

  it('does not mutate the input graph', () => {
    const original = generateGraph(10, mulberry32(2))
    layoutGraph(original)
    for (const node of original.nodes) {
      expect(node.x).toBeUndefined()
      expect(node.y).toBeUndefined()
    }
  })

  it('preserves topology (nodes, edges, start/goal) unchanged', () => {
    const original = generateGraph(10, mulberry32(3))
    const laidOut = layoutGraph(original)
    expect(laidOut.startNodeId).toBe(original.startNodeId)
    expect(laidOut.goalNodeId).toBe(original.goalNodeId)
    expect(laidOut.nodes.map((n) => n.id)).toEqual(original.nodes.map((n) => n.id))
    expect(laidOut.edges).toEqual(original.edges)
  })

  it('spreads nodes farther apart at higher Clarity levels', () => {
    const graph = generateGraph(20, mulberry32(4))
    const base = layoutGraph(graph, 0)
    const clearer = layoutGraph(graph, 5)

    const spanOf = (g: typeof base) => {
      const xs = g.nodes.map((n) => n.x ?? 0)
      const ys = g.nodes.map((n) => n.y ?? 0)
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    }

    expect(spanOf(clearer)).toBeGreaterThan(spanOf(base))
  })
})

describe('computeLayoutForces', () => {
  it('pushes nodes apart more at higher levels: stronger repulsion, longer links, bigger collision radius', () => {
    const base = computeLayoutForces(0)
    const higher = computeLayoutForces(3)

    expect(higher.chargeStrength).toBeLessThan(base.chargeStrength) // more negative = stronger repulsion
    expect(higher.linkDistance).toBeGreaterThan(base.linkDistance)
    expect(higher.collideRadius).toBeGreaterThan(base.collideRadius)
  })
})

describe('computeViewBounds', () => {
  it('matches the full graph bounds when the graph is small enough to fit', () => {
    const graph = layoutGraph(generateGraph(8, mulberry32(5)))
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900)
    expect(view).toEqual(full)
  })

  it('caps each dimension at maxSize and centers on the focus point once the graph outgrows it', () => {
    // A long chain lays out much wider than tall — exercise independent-axis capping.
    const adjacency: Record<string, string[]> = {}
    const nodes = Array.from({ length: 40 }, (_, i) => `n${i}`)
    for (let i = 0; i < nodes.length; i++) {
      adjacency[nodes[i]] = [nodes[i - 1], nodes[i + 1]].filter((id): id is string => id !== undefined)
    }
    const graph = layoutGraph({
      nodes: nodes.map((id, i) => ({ id, isStart: i === 0, isGoal: i === nodes.length - 1, x: i * 100, y: 0 })),
      edges: nodes.slice(0, -1).map((id, i) => ({ id: `${id}--${nodes[i + 1]}`, source: id, target: nodes[i + 1], weight: 1 })),
      startNodeId: nodes[0],
      goalNodeId: nodes[nodes.length - 1],
      adjacency,
    })

    const view = computeViewBounds(graph, 500, 0, 200)
    expect(view.width).toBe(200)
    expect(view.minX).toBeCloseTo(400, 0) // centered on focusX=500 within a 200-wide window
  })

  it('clamps the window so it never drifts past the graph\'s actual extent', () => {
    const graph = layoutGraph(generateGraph(30, mulberry32(6)))
    const full = computeGraphBounds(graph)
    // Focus way outside the graph entirely — the window should still land fully inside full bounds.
    const view = computeViewBounds(graph, full.minX - 10_000, full.minY - 10_000, 100)
    expect(view.minX).toBeGreaterThanOrEqual(full.minX)
    expect(view.minY).toBeGreaterThanOrEqual(full.minY)
    expect(view.minX + view.width).toBeLessThanOrEqual(full.minX + full.width + 0.001)
    expect(view.minY + view.height).toBeLessThanOrEqual(full.minY + full.height + 0.001)
  })
})
