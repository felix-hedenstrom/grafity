import { describe, expect, it } from 'vitest'
import { fixedScaleBar, formatLightDistance, scaleChangePercent, worldUnitsToLightSeconds } from './scaleBar'

describe('worldUnitsToLightSeconds', () => {
  it('treats c world units as one light-second', () => {
    expect(worldUnitsToLightSeconds(600, 600)).toBe(1)
    expect(worldUnitsToLightSeconds(150, 600)).toBe(0.25)
  })
})

describe('formatLightDistance', () => {
  it('stays in light-seconds below one light-second', () => {
    expect(formatLightDistance(0.25)).toEqual({ value: 0.25, unit: 'ls' })
  })

  it('climbs the unit ladder', () => {
    expect(formatLightDistance(30).unit).toBe('ls')
    expect(formatLightDistance(120)).toEqual({ value: 2, unit: 'lmin' })
    expect(formatLightDistance(7200)).toEqual({ value: 2, unit: 'lh' })
    expect(formatLightDistance(86400 * 3)).toEqual({ value: 3, unit: 'ld' })
    expect(formatLightDistance(31_557_600 * 4).unit).toBe('ly')
  })
})

describe('fixedScaleBar', () => {
  it('labels the fixed span with two decimals', () => {
    // 1 world unit/px, c=600 → 100px is 1/6 ls ≈ 0.17 ls.
    expect(fixedScaleBar(1, 100, 600)).toEqual({ label: '0.17 ls', pixelLength: 100 })
  })

  it('keeps the bar the same length at every zoom level', () => {
    for (const wpp of [0.37, 3.1, 48, 900, 12_345]) {
      expect(fixedScaleBar(wpp, 100, 600)!.pixelLength).toBe(100)
    }
  })

  it('switches units as the view zooms out', () => {
    // 100px = exactly 3 light-minutes.
    expect(fixedScaleBar((180 * 600) / 100, 100, 600)?.label).toBe('3.00 lmin')
    // 100px = 90 light-minutes → 1.5 light-hours.
    expect(fixedScaleBar((5400 * 600) / 100, 100, 600)?.label).toBe('1.50 lh')
  })

  it('returns null for an unmeasured view', () => {
    expect(fixedScaleBar(Infinity)).toBeNull()
    expect(fixedScaleBar(0)).toBeNull()
  })
})

describe('scaleChangePercent', () => {
  it('reports growth and shrinkage', () => {
    expect(scaleChangePercent(100, 138)).toBeCloseTo(38)
    expect(scaleChangePercent(200, 100)).toBeCloseTo(-50)
    expect(scaleChangePercent(0, 100)).toBe(0)
  })
})
