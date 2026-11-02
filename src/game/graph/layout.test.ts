import { describe, expect, it } from 'vitest'
import type { Graph } from './types'
import { computeDynamicViewSize, computeGraphBounds, computeViewBounds, MAX_VIEW_SIZE, MIN_GRAPH_VIEW_SIZE, MIN_VIEW_SIZE } from './layout'

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
  it('matches the full graph bounds when the graph already fills at least MIN_VIEW_SIZE', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 600, y: 300 },
      { id: 'c', x: 300, y: 600 },
    ])
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900)
    expect(view).toEqual(full)
  })

  it('pads a graph smaller than MIN_GRAPH_VIEW_SIZE out to MIN_GRAPH_VIEW_SIZE, centered on the graph', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 5 },
      { id: 'c', x: 5, y: 10 },
    ])
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900)
    expect(view.width).toBe(MIN_GRAPH_VIEW_SIZE)
    expect(view.height).toBe(MIN_GRAPH_VIEW_SIZE)
    const graphCenterX = full.minX + full.width / 2
    const graphCenterY = full.minY + full.height / 2
    expect(view.minX).toBeCloseTo(graphCenterX - MIN_GRAPH_VIEW_SIZE / 2, 5)
    expect(view.minY).toBeCloseTo(graphCenterY - MIN_GRAPH_VIEW_SIZE / 2, 5)
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

describe('computeViewBounds with containerAspectRatio', () => {
  it('grows the narrower axis to fill a wide container instead of staying a letterboxed square', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 5 },
      { id: 'c', x: 5, y: 10 },
    ])
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900, 2)
    expect(view.height).toBe(MIN_GRAPH_VIEW_SIZE)
    expect(view.width).toBe(MIN_GRAPH_VIEW_SIZE * 2)
    const graphCenterX = full.minX + full.width / 2
    expect(view.minX).toBeCloseTo(graphCenterX - (MIN_GRAPH_VIEW_SIZE * 2) / 2, 5)
  })

  it('grows the narrower axis past the graph\'s own extent when the graph already fits as-is', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 600, y: 300 },
      { id: 'c', x: 300, y: 600 },
    ])
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 900, 2)
    expect(view.height).toBe(full.height)
    expect(view.width).toBeCloseTo(full.height * 2, 5)
    expect(view.width).toBeGreaterThan(full.width)
  })

  it('keeps the grown axis clamped inside the graph\'s extent when windowed and there is room to shift instead of grow past it', () => {
    const positions = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }))
    const graph = graphWithPositions(positions)
    const full = computeGraphBounds(graph)
    const view = computeViewBounds(graph, 0, 0, 100, 2)
    expect(view.minX).toBeGreaterThanOrEqual(full.minX - 0.001)
    expect(view.minX + view.width).toBeLessThanOrEqual(full.minX + full.width + 0.001)
  })

  it('is a no-op when the aspect ratio already matches', () => {
    const graph = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 600, y: 300 },
      { id: 'c', x: 300, y: 600 },
    ])
    const withoutRatio = computeViewBounds(graph, 0, 0, 900)
    const withMatchingRatio = computeViewBounds(graph, 0, 0, 900, withoutRatio.width / withoutRatio.height)
    expect(withMatchingRatio).toEqual(withoutRatio)
  })

  it('allows the grown axis to exceed maxSize — this is intentional, not a bug to cap back down', () => {
    const positions = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, x: i * 100, y: 0 }))
    const graph = graphWithPositions(positions)
    const view = computeViewBounds(graph, 500, 0, 200, 4)
    expect(view.height).toBe(MIN_GRAPH_VIEW_SIZE)
    expect(view.width).toBe(MIN_GRAPH_VIEW_SIZE * 4)
    expect(view.width).toBeGreaterThan(200)
  })
})

describe('computeDynamicViewSize', () => {
  it('falls back to MIN_VIEW_SIZE with no other walkers to fit', () => {
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [])).toBe(MIN_VIEW_SIZE)
  })

  it('stays at MIN_VIEW_SIZE when the other walkers are already close by', () => {
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [{ x: 10, y: 0 }])).toBe(MIN_VIEW_SIZE)
  })

  it('grows to fit the nearest other walkers, with margin, once they are far enough away', () => {
    const size = computeDynamicViewSize({ x: 0, y: 0 }, [{ x: 500, y: 0 }])
    expect(size).toBeGreaterThan(MIN_VIEW_SIZE)
    expect(size).toBeLessThan(MAX_VIEW_SIZE)
  })

  it('only considers the two nearest other walkers, ignoring farther ones', () => {
    const withFarOutlier = computeDynamicViewSize(
      { x: 0, y: 0 },
      [{ x: 100, y: 0 }, { x: 150, y: 0 }, { x: 100_000, y: 0 }],
    )
    const withoutOutlier = computeDynamicViewSize({ x: 0, y: 0 }, [{ x: 100, y: 0 }, { x: 150, y: 0 }])
    expect(withFarOutlier).toBe(withoutOutlier)
  })

  it('never exceeds MAX_VIEW_SIZE, however far the nearest walkers are', () => {
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [{ x: 1_000_000, y: 0 }])).toBe(MAX_VIEW_SIZE)
  })
})
