import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../utils/rng'
import { samplePoissonDisk } from './poissonDisk'

describe('samplePoissonDisk', () => {
  it('keeps every point within the given bounds', () => {
    const points = samplePoissonDisk(400, 300, 30, mulberry32(1))
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThan(400)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(300)
    }
  })

  it('never places two points closer together than minDistance', () => {
    const minDistance = 25
    const points = samplePoissonDisk(500, 400, minDistance, mulberry32(2))
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[i].x - points[j].x
        const dy = points[i].y - points[j].y
        const distance = Math.sqrt(dx * dx + dy * dy)
        expect(distance).toBeGreaterThanOrEqual(minDistance - 1e-9)
      }
    }
  })

  it('fills the area reasonably densely, not just a handful of points', () => {
    // A 600x600 area at spacing 40 fits roughly 600*600/40² ≈ 225 points at full hex-packing
    // density; blue noise undershoots that but should still comfortably clear three figures.
    const points = samplePoissonDisk(600, 600, 40, mulberry32(3))
    expect(points.length).toBeGreaterThan(100)
  })

  it('is deterministic for a given seed', () => {
    const a = samplePoissonDisk(300, 300, 30, mulberry32(42))
    const b = samplePoissonDisk(300, 300, 30, mulberry32(42))
    expect(a).toEqual(b)
  })

  it('produces different layouts for different seeds', () => {
    const a = samplePoissonDisk(300, 300, 30, mulberry32(1))
    const b = samplePoissonDisk(300, 300, 30, mulberry32(2))
    expect(a).not.toEqual(b)
  })

  it('handles a tiny area by placing at least the seed point', () => {
    const points = samplePoissonDisk(10, 10, 30, mulberry32(1))
    expect(points.length).toBeGreaterThanOrEqual(1)
  })
})
