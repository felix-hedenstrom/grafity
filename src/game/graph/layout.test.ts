import { describe, expect, it } from 'vitest'
import type { Graph } from './types'
import { computeGraphBounds, computeViewBounds } from './layout'

/** A minimal graph with nodes placed wherever the caller wants — computeGraphBounds/computeViewBounds only care about node.x/y, not how a graph got generated. */
function graphWithPositions(positions: { id: string; x: number; y: number }[]): Graph {
  return {
    nodes: positions.map((p, i) => ({ id: p.id, isStart: i === 0, isGoal: i === positions.length - 1, x: p.x, y: p.y })),
    edges: [],
    startNodeId: positions[0].id,
    goalNodeId: positions[positions.length - 1].id,
    adjacency: Object.fromEntries(positions.map((p) => [p.id, []])),
  }
}

describe('computeViewBounds', () => {
  it('matches the full graph bounds when the graph is small enough to fit', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 50 },
      { id: 'c', x: 50, y: 100 },
    ])
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900)
    expect(view).toEqual(full)
  })

  it('caps each dimension at maxSize and centers on the focus point once the graph outgrows it', () => {
    // A long chain laid out much wider than tall — exercises independent-axis capping.
    const positions = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, x: i * 100, y: 0 }))
    const graph = graphWithPositions(positions)

    const view = computeViewBounds(graph, 500, 0, 200)
    expect(view.width).toBe(200)
    expect(view.minX).toBeCloseTo(400, 0) // centered on focusX=500 within a 200-wide window
  })

  it('clamps the window so it never drifts past the graph\'s actual extent', () => {
    const positions = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }))
    const graph = graphWithPositions(positions)
    const full = computeGraphBounds(graph)
    // Focus way outside the graph entirely — the window should still land fully inside full bounds.
    const view = computeViewBounds(graph, full.minX - 10_000, full.minY - 10_000, 100)
    expect(view.minX).toBeGreaterThanOrEqual(full.minX)
    expect(view.minY).toBeGreaterThanOrEqual(full.minY)
    expect(view.minX + view.width).toBeLessThanOrEqual(full.minX + full.width + 0.001)
    expect(view.minY + view.height).toBeLessThanOrEqual(full.minY + full.height + 0.001)
  })
})
