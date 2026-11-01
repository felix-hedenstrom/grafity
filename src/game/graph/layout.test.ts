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
