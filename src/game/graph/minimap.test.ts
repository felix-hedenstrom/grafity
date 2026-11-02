import { describe, expect, it } from 'vitest'
import type { GraphBounds } from './layout'
import { computeMinimapTransform, projectToMinimap } from './minimap'

describe('computeMinimapTransform', () => {
  it('scales a square graph to fill a square minimap exactly', () => {
    const bounds: GraphBounds = { minX: 0, minY: 0, width: 200, height: 200 }
    const transform = computeMinimapTransform(bounds, 100, 100)
    expect(transform.scale).toBe(0.5)
    expect(transform.offsetX).toBe(0)
    expect(transform.offsetY).toBe(0)
  })

  it('letterboxes (centers, does not stretch) when the aspect ratios differ', () => {
    // Graph is twice as wide as tall; minimap is square — height is the limiting axis.
    const bounds: GraphBounds = { minX: 0, minY: 0, width: 400, height: 200 }
    const transform = computeMinimapTransform(bounds, 100, 100)
    expect(transform.scale).toBe(0.25) // limited by height: 100/400=0.25 vs 100/200=0.5
    expect(transform.offsetX).toBe(0) // width fills exactly: 400*0.25=100
    expect(transform.offsetY).toBe(25) // height only fills 50px of 100 — centered with 25px margin each side
  })
})

describe('projectToMinimap', () => {
  it('maps the bounds top-left corner to the transform offset', () => {
    const bounds: GraphBounds = { minX: 10, minY: 20, width: 200, height: 200 }
    const transform = computeMinimapTransform(bounds, 100, 100)
    const p = projectToMinimap(10, 20, bounds, transform)
    expect(p).toEqual({ x: transform.offsetX, y: transform.offsetY })
  })

  it('maps the bounds bottom-right corner to the far edge of the scaled region', () => {
    const bounds: GraphBounds = { minX: 0, minY: 0, width: 200, height: 200 }
    const transform = computeMinimapTransform(bounds, 100, 100)
    const p = projectToMinimap(200, 200, bounds, transform)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(100)
  })
})
