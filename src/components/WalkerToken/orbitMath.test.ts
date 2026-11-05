import { describe, expect, it } from 'vitest'
import { ORBIT_PERIOD_MS, orbitFrameAt } from './orbitMath'

const WAIT = 4000
const RADIUS = 13
const NOSE = 37

const radiusOf = (t: number) => Math.hypot(orbitFrameAt(t, WAIT, RADIUS, NOSE).x, orbitFrameAt(t, WAIT, RADIUS, NOSE).y)

/** Shortest signed angular difference, degrees. */
const angleDiff = (a: number, b: number) => ((((a - b) % 360) + 540) % 360) - 180

describe('orbitFrameAt', () => {
  it('starts and ends exactly at the node center, at rest', () => {
    for (const t of [0, WAIT]) {
      const frame = orbitFrameAt(t, WAIT, RADIUS, NOSE)
      expect(frame.x).toBeCloseTo(0, 10)
      expect(frame.y).toBeCloseTo(0, 10)
      expect(frame.speed).toBeCloseTo(0, 10)
    }
  })

  it('clamps t outside the rest window to the endpoints', () => {
    expect(orbitFrameAt(-50, WAIT, RADIUS, NOSE)).toEqual(orbitFrameAt(0, WAIT, RADIUS, NOSE))
    expect(orbitFrameAt(WAIT + 50, WAIT, RADIUS, NOSE)).toEqual(orbitFrameAt(WAIT, WAIT, RADIUS, NOSE))
  })

  it('holds the full radius through the cruise segment', () => {
    // Ramps are min(0.3 * 4000, 800) = 800ms each side.
    for (const t of [800, 2000, 3200]) expect(radiusOf(t)).toBeCloseTo(RADIUS, 8)
  })

  it('ramps the radius monotonically out and back', () => {
    for (let t = 0; t < 800; t += 50) expect(radiusOf(t + 50)).toBeGreaterThan(radiusOf(t))
    for (let t = 3200; t < WAIT; t += 50) expect(radiusOf(t + 50)).toBeLessThan(radiusOf(t))
  })

  it('is continuous across the segment joins', () => {
    for (const join of [800, 3200]) {
      const before = orbitFrameAt(join - 0.01, WAIT, RADIUS, NOSE)
      const after = orbitFrameAt(join + 0.01, WAIT, RADIUS, NOSE)
      expect(after.x).toBeCloseTo(before.x, 2)
      expect(after.y).toBeCloseTo(before.y, 2)
      expect(after.speed).toBeCloseTo(before.speed, 2)
      expect(Math.abs(angleDiff(after.noseDeg, before.noseDeg))).toBeLessThan(0.5)
    }
  })

  it('launches along the entry nose direction', () => {
    // Early in the ramp the motion is dominated by the radial spiral-out, which points along
    // the seeded nose — this is what makes the orbit entry snap-free.
    const frame = orbitFrameAt(20, WAIT, RADIUS, NOSE)
    expect(Math.abs(angleDiff(frame.noseDeg, NOSE))).toBeLessThan(3)
    const positionDeg = (Math.atan2(frame.y, frame.x) * 180) / Math.PI
    expect(Math.abs(angleDiff(positionDeg, NOSE))).toBeLessThan(3)
  })

  it('points tangent to the circle (phase + 90°) during cruise', () => {
    const frame = orbitFrameAt(2000, WAIT, RADIUS, NOSE)
    const positionDeg = (Math.atan2(frame.y, frame.x) * 180) / Math.PI
    expect(Math.abs(angleDiff(frame.noseDeg, positionDeg + 90))).toBeLessThan(1e-6)
  })

  it('cruises at the classic orbital period', () => {
    const a = orbitFrameAt(1200, WAIT, RADIUS, NOSE)
    const b = orbitFrameAt(1200 + ORBIT_PERIOD_MS / 4, WAIT, RADIUS, NOSE)
    const aDeg = (Math.atan2(a.y, a.x) * 180) / Math.PI
    const bDeg = (Math.atan2(b.y, b.x) * 180) / Math.PI
    expect(Math.abs(angleDiff(bDeg, aDeg + 90))).toBeLessThan(1e-6)
  })

  it('degrades gracefully on short waits (ramps never overlap)', () => {
    const shortWait = 900 // ramps are 270ms each, cruise 360ms
    expect(orbitFrameAt(0, shortWait, RADIUS, NOSE).speed).toBeCloseTo(0, 10)
    expect(orbitFrameAt(shortWait, shortWait, RADIUS, NOSE).speed).toBeCloseTo(0, 10)
    const mid = orbitFrameAt(shortWait / 2, shortWait, RADIUS, NOSE)
    expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(RADIUS, 8)
  })
})
