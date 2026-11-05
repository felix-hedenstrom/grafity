import { describe, expect, it } from 'vitest'
import type { Graph } from './types'
import { computeDynamicViewSize, computeGraphBounds, computeViewBounds, MAX_VIEW_SIZE, MIN_GRAPH_VIEW_SIZE, MIN_VIEW_SIZE, viewScale } from './layout'
import { PRODUCTION_CONFIG } from '../config/production'

/** A minimal graph with nodes placed wherever the caller wants — computeGraphBounds/computeViewBounds only care about node.x/y, not how a graph got generated. Edges (for viewScale/minEdgeLength, whose weights are real node-to-node distances) can be passed as id pairs. */
function graphWithPositions(positions: { id: string; x: number; y: number }[], edgePairs: [string, string][] = []): Graph {
  return {
    nodes: positions.map((p, i) => ({ id: p.id, isStart: i === 0, isGoal: i === positions.length - 1, x: p.x, y: p.y })),
    edges: edgePairs.map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
    startNodeId: positions[0].id,
    goalNodeId: positions[positions.length - 1].id,
    adjacency: Object.fromEntries(positions.map((p) => [p.id, edgePairs.filter((pair) => pair.includes(p.id)).map(([a, b]) => (a === p.id ? b : a))])),
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

  it('stays centered on the focus even at the graph\'s edge, showing space beyond it', () => {
    const positions = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }))
    const graph = graphWithPositions(positions)
    const full = computeGraphBounds(graph)
    // Focus right on the map's edge — the window keeps the focus centered instead of pinning
    // inside the graph's bounds and letting the walker drift off-center.
    const view = computeViewBounds(graph, full.minX, full.minY, 100)
    expect(view.minX).toBeCloseTo(full.minX - view.width / 2, 5)
    expect(view.minY).toBeCloseTo(full.minY - view.height / 2, 5)
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

  it('keeps the window centered on the focus when the grown axis extends past the graph\'s edge', () => {
    const positions = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, x: Math.cos(i) * 300, y: Math.sin(i) * 300 }))
    const graph = graphWithPositions(positions)
    const full = computeGraphBounds(graph)
    // Focus on the left edge with a wide container — the grown width overhangs the edge
    // symmetrically instead of shifting the focus off-center to stay inside the graph.
    const view = computeViewBounds(graph, full.minX, 0, 100, 2)
    expect(view.minX + view.width / 2).toBeCloseTo(full.minX, 5)
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

  it('grows past even the scaled ceiling to keep the ~5 nearest stars in frame', () => {
    // Four neighbors sitting far beyond MAX_VIEW_SIZE — a sparse warped region. The window must
    // cover the farthest of them (Chebyshev half-span 3000 → size 3000 * 2 * margin), ceiling or not.
    const graph = graphWithPositions([
      { id: 'me', x: 0, y: 0 },
      { id: 'a', x: 3000, y: 0 },
      { id: 'b', x: -2800, y: 100 },
      { id: 'c', x: 0, y: 2900 },
      { id: 'd', x: 500, y: -2700 },
    ])
    const size = computeDynamicViewSize({ x: 0, y: 0 }, [], 1, graph)
    expect(size).toBeGreaterThanOrEqual(3000 * 2)
    // And in a dense region the floor stays inert — the ordinary clamps decide.
    const dense = graphWithPositions([
      { id: 'me', x: 0, y: 0 },
      { id: 'a', x: 30, y: 0 },
      { id: 'b', x: -28, y: 10 },
      { id: 'c', x: 0, y: 29 },
      { id: 'd', x: 5, y: -27 },
    ])
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [], 1, dense)).toBe(MIN_VIEW_SIZE)
  })

  it('scales both clamps by the view scale on spread-out graphs', () => {
    const scale = 10
    // No others: the floor itself scales.
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [], scale)).toBe(MIN_VIEW_SIZE * scale)
    // A walker past the unscaled floor but inside the scaled one still gets the scaled floor.
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [{ x: MIN_VIEW_SIZE, y: 0 }], scale)).toBe(MIN_VIEW_SIZE * scale)
    // And the ceiling scales too.
    expect(computeDynamicViewSize({ x: 0, y: 0 }, [{ x: 10_000_000, y: 0 }], scale)).toBe(MAX_VIEW_SIZE * scale)
  })
})

describe('viewScale', () => {
  it('is 1 for a graph at or below the reference spacing (and for edge-less graphs)', () => {
    const atReference = graphWithPositions(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: PRODUCTION_CONFIG.graph.spacingAtReferenceCount, y: 0 },
      ],
      [['a', 'b']],
    )
    expect(viewScale(atReference)).toBe(1)

    const tight = graphWithPositions(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 40, y: 0 },
      ],
      [['a', 'b']],
    )
    expect(viewScale(tight)).toBe(1)

    const edgeless = graphWithPositions([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100_000, y: 0 },
    ])
    expect(viewScale(edgeless)).toBe(1)
  })

  it('grows in proportion to the shortest edge past the reference spacing', () => {
    const graph = graphWithPositions(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: PRODUCTION_CONFIG.graph.spacingAtReferenceCount * 10, y: 0 },
        { id: 'c', x: PRODUCTION_CONFIG.graph.spacingAtReferenceCount * 40, y: 0 },
      ],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    )
    expect(viewScale(graph)).toBeCloseTo(10, 5)
  })
})
