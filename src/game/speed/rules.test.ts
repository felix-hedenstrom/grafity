import { describe, expect, it } from 'vitest'
import {
  BASE_DISTANCE_PER_SECOND,
  computeDiscoverWaitMs,
  computeDistancePerSecond,
  computeEdgeTravelMs,
  computeMomentumMultiplier,
  computeMomentumPercentPerSecond,
  DISCOVER_WAIT_BASE_MS,
  DISCOVER_WAIT_PERCENT_PER_LEVEL,
  MIN_TICK_INTERVAL_MS,
  MOMENTUM_MAX_MULTIPLIER,
  MOMENTUM_PERCENT_PER_LEVEL,
  QUICK_STEPS_SPEED_PER_LEVEL,
} from './rules'

/** A fixed edge weight used throughout these tests so the interval math stays comparable across cases. */
const TEST_EDGE_WEIGHT = 60
/** The interval crossing TEST_EDGE_WEIGHT takes at base speed, with no upgrades. */
const BASE_INTERVAL_MS = (1000 * TEST_EDGE_WEIGHT) / BASE_DISTANCE_PER_SECOND

describe('computeEdgeTravelMs', () => {
  it('returns the base interval with no upgrades and no elapsed time', () => {
    expect(computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 0 }, TEST_EDGE_WEIGHT)).toBe(
      BASE_INTERVAL_MS,
    )
  })

  it('a heavier edge takes proportionally longer to cross', () => {
    const light = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 0 }, TEST_EDGE_WEIGHT)
    const heavy = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 0 }, TEST_EDGE_WEIGHT * 2)
    expect(heavy).toBeCloseTo(light * 2)
  })

  it('each Quick Steps level adds a flat amount of base speed, shrinking the interval', () => {
    const level1 = computeEdgeTravelMs({ quickStepsLevel: 1, momentumLevel: 0, elapsedSecondsThisRun: 0 }, TEST_EDGE_WEIGHT)
    const level2 = computeEdgeTravelMs({ quickStepsLevel: 2, momentumLevel: 0, elapsedSecondsThisRun: 0 }, TEST_EDGE_WEIGHT)
    expect(level1).toBeLessThan(BASE_INTERVAL_MS)
    expect(level2).toBeLessThan(level1)
  })

  it('Momentum makes the interval shrink as elapsed time grows', () => {
    const early = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 10 }, TEST_EDGE_WEIGHT)
    const later = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 500 }, TEST_EDGE_WEIGHT)
    expect(later).toBeLessThan(early)
    expect(early).toBeLessThan(BASE_INTERVAL_MS)
  })

  it('a higher momentum level shrinks the interval more at the same elapsed time', () => {
    const lowLevel = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 1, elapsedSecondsThisRun: 20 }, TEST_EDGE_WEIGHT)
    const highLevel = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 10, elapsedSecondsThisRun: 20 }, TEST_EDGE_WEIGHT)
    expect(highLevel).toBeLessThan(lowLevel)
  })

  it('momentumLevel 0 applies no bonus regardless of elapsed time', () => {
    const interval = computeEdgeTravelMs({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 500 }, TEST_EDGE_WEIGHT)
    expect(interval).toBe(BASE_INTERVAL_MS)
  })

  it('never drops below the minimum interval, however much speed is stacked', () => {
    const interval = computeEdgeTravelMs(
      { quickStepsLevel: 50, momentumLevel: 50, elapsedSecondsThisRun: 10_000 },
      TEST_EDGE_WEIGHT,
    )
    expect(interval).toBe(MIN_TICK_INTERVAL_MS)
  })

  it('stacks Quick Steps and Momentum multiplicatively', () => {
    const both = computeEdgeTravelMs({ quickStepsLevel: 2, momentumLevel: 1, elapsedSecondsThisRun: 60 }, TEST_EDGE_WEIGHT)
    const quickOnly = computeEdgeTravelMs({ quickStepsLevel: 2, momentumLevel: 0, elapsedSecondsThisRun: 60 }, TEST_EDGE_WEIGHT)
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

describe('computeDistancePerSecond', () => {
  it('is the base rate with no upgrades', () => {
    expect(computeDistancePerSecond({ quickStepsLevel: 0, momentumLevel: 0, elapsedSecondsThisRun: 0 })).toBe(
      BASE_DISTANCE_PER_SECOND,
    )
  })

  it('adds a flat bonus per Quick Steps level', () => {
    expect(computeDistancePerSecond({ quickStepsLevel: 1, momentumLevel: 0, elapsedSecondsThisRun: 0 })).toBe(
      BASE_DISTANCE_PER_SECOND + QUICK_STEPS_SPEED_PER_LEVEL,
    )
  })
})

describe('QUICK_STEPS_SPEED_PER_LEVEL', () => {
  it('is a small positive flat bonus per level', () => {
    expect(QUICK_STEPS_SPEED_PER_LEVEL).toBeGreaterThan(0)
  })
})

describe('computeDiscoverWaitMs', () => {
  it('is the base wait at level 0', () => {
    expect(computeDiscoverWaitMs(0)).toBe(DISCOVER_WAIT_BASE_MS)
  })

  it('shrinks by the compounding percent per level, uncapped, never reaching zero', () => {
    const level1 = computeDiscoverWaitMs(1)
    const level2 = computeDiscoverWaitMs(2)
    expect(level1).toBeCloseTo(DISCOVER_WAIT_BASE_MS * (1 - DISCOVER_WAIT_PERCENT_PER_LEVEL))
    expect(level2).toBeLessThan(level1)
    expect(computeDiscoverWaitMs(100)).toBeGreaterThan(0)
  })
})
