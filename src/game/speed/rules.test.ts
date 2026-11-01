import { describe, expect, it } from 'vitest'
import {
  BASE_TICK_INTERVAL_MS,
  computeEdgesPerSecond,
  computeMomentumMultiplier,
  computeMomentumPercentPerSecond,
  computeTickIntervalMs,
  MIN_TICK_INTERVAL_MS,
  MOMENTUM_MAX_MULTIPLIER,
  MOMENTUM_PERCENT_PER_LEVEL,
  QUICK_STEPS_SPEED_PER_LEVEL,
} from './rules'

describe('computeTickIntervalMs', () => {
  it('returns the base interval with no upgrades and no elapsed time', () => {
    expect(computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 0 })).toBe(
      BASE_TICK_INTERVAL_MS,
    )
  })

  it('each Quick Steps level adds a flat amount of base speed, shrinking the interval', () => {
    const level1 = computeTickIntervalMs({ quickStepsLevel: 1, momentumLevel: 0, elapsedSecondsThisRun: 0 })
    const level2 = computeTickIntervalMs({ quickStepsLevel: 2, momentumLevel: 0, elapsedSecondsThisRun: 0 })
    expect(level1).toBeLessThan(BASE_TICK_INTERVAL_MS)
    expect(level2).toBeLessThan(level1)
  })

  it('Momentum makes the interval shrink as elapsed time grows', () => {
    const early = computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 10 })
    const later = computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 500 })
    expect(later).toBeLessThan(early)
    expect(early).toBeLessThan(BASE_TICK_INTERVAL_MS)
  })

  it('a higher momentum level shrinks the interval more at the same elapsed time', () => {
    const lowLevel = computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 20 })
    const highLevel = computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 10, elapsedSecondsThisRun: 20 })
    expect(highLevel).toBeLessThan(lowLevel)
  })

  it('momentumLevel 0 applies no bonus regardless of elapsed time', () => {
    const interval = computeTickIntervalMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 500 })
    expect(interval).toBe(BASE_TICK_INTERVAL_MS)
  })

  it('never drops below the minimum interval, however much speed is stacked', () => {
    const interval = computeTickIntervalMs({
      quickStepsLevel: 50,
      momentumLevel: 50,
      elapsedSecondsThisRun: 10_000,
    })
    expect(interval).toBe(MIN_TICK_INTERVAL_MS)
  })

  it('stacks Quick Steps and Momentum multiplicatively', () => {
    const both = computeTickIntervalMs({ quickStepsLevel: 2, momentumLevel: 1, elapsedSecondsThisRun: 60 })
    const quickOnly = computeTickIntervalMs({ quickStepsLevel: 2, momentumLevel: 0, elapsedSecondsThisRun: 60 })
    expect(both).toBeLessThan(quickOnly)
  })
})

describe('computeMomentumPercentPerSecond', () => {
  it('is zero at level 0', () => {
    expect(computeMomentumPercentPerSecond(0)).toBe(0)
  })

  it('is the base rate at level 1', () => {
    expect(computeMomentumPercentPerSecond(1)).toBeCloseTo(MOMENTUM_PERCENT_PER_LEVEL)
  })

  it('scales linearly with level, uncapped', () => {
    expect(computeMomentumPercentPerSecond(10)).toBeCloseTo(10 * MOMENTUM_PERCENT_PER_LEVEL)
  })
})

describe('computeMomentumMultiplier', () => {
  it('is 1 (no bonus) at zero elapsed time', () => {
    expect(computeMomentumMultiplier(1, 0)).toBe(1)
  })

  it('is 1 (no bonus) at level 0, regardless of elapsed time', () => {
    expect(computeMomentumMultiplier(0, 1000)).toBe(1)
  })

  it("compounds by the level's percent each second", () => {
    expect(computeMomentumMultiplier(1, 1)).toBeCloseTo(1 + MOMENTUM_PERCENT_PER_LEVEL)
    expect(computeMomentumMultiplier(1, 2)).toBeCloseTo((1 + MOMENTUM_PERCENT_PER_LEVEL) ** 2)
  })

  it('never exceeds MOMENTUM_MAX_MULTIPLIER, no matter how much time or level is stacked', () => {
    expect(computeMomentumMultiplier(50, 10_000)).toBe(MOMENTUM_MAX_MULTIPLIER)
  })
})

describe('computeEdgesPerSecond', () => {
  it('is the inverse of the interval in seconds', () => {
    expect(computeEdgesPerSecond(1000)).toBe(1)
    expect(computeEdgesPerSecond(500)).toBe(2)
    expect(computeEdgesPerSecond(2000)).toBe(0.5)
  })
})

describe('QUICK_STEPS_SPEED_PER_LEVEL', () => {
  it('is a small positive flat bonus per level', () => {
    expect(QUICK_STEPS_SPEED_PER_LEVEL).toBeGreaterThan(0)
  })
})
