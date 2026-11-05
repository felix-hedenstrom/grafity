import { describe, expect, it } from 'vitest'
import { PRODUCTION_CONFIG } from '../config/production'
import {
  computeAcceleration,
  computeDiscoverWaitMs,
  computeEdgeMotion,
  computeNextEdgeMotion,
  velocityAtElapsedMs,
  computeMomentumMultiplier,
  computeMomentumPercentPerSecond,
} from './rules'

/** A fixed edge weight used throughout these tests so the interval math stays comparable across cases. */
const TEST_EDGE_WEIGHT = 60

describe('computeMomentumPercentPerSecond', () => {
  it('is zero when Momentum is not owned', () => {
    expect(computeMomentumPercentPerSecond(false)).toBe(0)
  })

  it('is the configured rate when owned', () => {
    expect(computeMomentumPercentPerSecond(true)).toBe(PRODUCTION_CONFIG.upgrades.momentum.percentPerSecond)
  })
})

describe('computeMomentumMultiplier', () => {
  const rate = PRODUCTION_CONFIG.upgrades.momentum.percentPerSecond

  it('is 1 (no bonus) at zero elapsed time', () => {
    expect(computeMomentumMultiplier(true, 0)).toBe(1)
  })

  it('is 1 (no bonus) when not owned, regardless of elapsed time', () => {
    expect(computeMomentumMultiplier(false, 1000)).toBe(1)
  })

  it('compounds by the configured percent each second', () => {
    expect(computeMomentumMultiplier(true, 1)).toBeCloseTo(1 + rate)
    expect(computeMomentumMultiplier(true, 2)).toBeCloseTo((1 + rate) ** 2)
  })

  it('reaches the maxMultiplier cap at about five minutes into a run', () => {
    expect(computeMomentumMultiplier(true, 290)).toBeLessThan(PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier)
    expect(computeMomentumMultiplier(true, 305)).toBe(PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier)
  })

  it('never exceeds PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier, no matter how much time passes', () => {
    expect(computeMomentumMultiplier(true, 10_000)).toBe(PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier)
  })
})

describe('computeAcceleration', () => {
  it('is the base rate at level 0', () => {
    expect(computeAcceleration(0)).toBe(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared)
  })

  it('compounds a bonus per Thrusters level', () => {
    expect(computeAcceleration(1)).toBeCloseTo(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared * (1 + PRODUCTION_CONFIG.upgrades.thrusters.percentPerLevel))
    expect(computeAcceleration(2)).toBeCloseTo(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared * (1 + PRODUCTION_CONFIG.upgrades.thrusters.percentPerLevel) ** 2)
  })

  it('unowned Momentum applies no bonus regardless of elapsed time', () => {
    expect(computeAcceleration(0, false, 500)).toBe(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared)
  })

  it('Momentum grows the acceleration bonus as elapsed time increases', () => {
    const early = computeAcceleration(0, true, 10)
    const later = computeAcceleration(0, true, 200)
    expect(later).toBeGreaterThan(early)
    expect(early).toBeGreaterThan(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared)
  })

  it('stacks Thrusters and Momentum multiplicatively', () => {
    const both = computeAcceleration(2, true, 60)
    const thrustersOnly = computeAcceleration(2, false, 60)
    expect(both).toBeGreaterThan(thrustersOnly)
  })

  it('caps the momentum bonus at PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier, no matter how much time passes', () => {
    expect(computeAcceleration(0, true, 10_000)).toBe(PRODUCTION_CONFIG.speed.baseAccelerationDistancePerSecondSquared * PRODUCTION_CONFIG.upgrades.momentum.maxMultiplier)
  })
})

describe('computeEdgeMotion', () => {
  const vMax = 10
  const acceleration = 5

  it('mustStop: a long edge accelerates to vMax, cruises, then decelerates to a full stop', () => {
    // accel distance: vMax²/2a = 10, decel distance: 10, cruise: 80 at vMax=10
    // accel time: vMax/a = 2s, decel time: 2s, cruise time: 80/10 = 8s -> 12s total
    const distance = 100
    const { travelMs, exitVelocity } = computeEdgeMotion(0, vMax, acceleration, distance, true)
    expect(exitVelocity).toBe(0)
    expect(travelMs).toBe(12_000)
  })

  it('mustStop: a short edge never reaches vMax (triangular profile), still stops exactly at the end', () => {
    const distance = 4 // peak = sqrt((2*5*4 + 0)/2) = sqrt(20) ≈ 4.472, well under vMax
    const { travelMs, exitVelocity } = computeEdgeMotion(0, vMax, acceleration, distance, true)
    const peak = Math.sqrt((2 * acceleration * distance) / 2)
    expect(peak).toBeLessThan(vMax)
    expect(exitVelocity).toBe(0)
    expect(travelMs).toBeCloseTo(((2 * peak) / acceleration) * 1000, 0)
  })

  it('mustStop: a nonzero entry speed shortens the crossing versus starting from rest', () => {
    const distance = 50
    const fromRest = computeEdgeMotion(0, vMax, acceleration, distance, true)
    const alreadyCruising = computeEdgeMotion(vMax, vMax, acceleration, distance, true)
    expect(alreadyCruising.travelMs).toBeLessThan(fromRest.travelMs)
    expect(alreadyCruising.exitVelocity).toBe(0)
  })

  it('!mustStop: a long edge reaches and holds vMax, carrying that speed on', () => {
    const distance = 100
    const { exitVelocity } = computeEdgeMotion(0, vMax, acceleration, distance, false)
    expect(exitVelocity).toBe(vMax)
  })

  it('!mustStop: a short edge is still accelerating at the far end, carrying a lower exit speed on', () => {
    const distance = 2 // accelDistance to vMax=10 is 10, so 2 is still mid-ramp
    const { exitVelocity } = computeEdgeMotion(0, vMax, acceleration, distance, false)
    expect(exitVelocity).toBeGreaterThan(0)
    expect(exitVelocity).toBeLessThan(vMax)
    expect(exitVelocity).toBeCloseTo(Math.sqrt(2 * acceleration * distance))
  })

  it('!mustStop: entering already at vMax just cruises the whole distance', () => {
    const distance = 50
    const { travelMs, exitVelocity } = computeEdgeMotion(vMax, vMax, acceleration, distance, false)
    expect(exitVelocity).toBe(vMax)
    expect(travelMs).toBe((distance / vMax) * 1000)
  })

  it('never drops below the minimum tick interval, however short the edge', () => {
    const { travelMs } = computeEdgeMotion(0, vMax, acceleration, 0.0001, true)
    expect(travelMs).toBe(PRODUCTION_CONFIG.speed.minTickIntervalMs)
  })

  it('mustStop, entry 0: the turnaround (accelEndMs === decelStartMs) sits at exactly half the distance', () => {
    const distance = 4 // triangular — never reaches vMax (see the test above)
    const motion = computeEdgeMotion(0, vMax, acceleration, distance, true)
    expect(motion.decelStartMs).toBe(motion.accelEndMs)
    // Equal accel/decel times from rest means equal accel/decel distances too.
    expect(motion.accelEndMs).toBeCloseTo(motion.travelMs / 2, -1)
  })

  it('mustStop, nonzero entry too fast to accelerate further: brakes immediately and still stops exactly in time', () => {
    const entry = vMax // 10
    const distance = entry ** 2 / (2 * acceleration) // exactly the distance needed to brake to 0
    const motion = computeEdgeMotion(entry, vMax, acceleration, distance, true)
    expect(motion.accelEndMs).toBe(0)
    expect(motion.decelStartMs).toBe(0)
    expect(motion.exitVelocity).toBe(0)
    expect(motion.travelMs).toBeCloseTo((entry / acceleration) * 1000, 0)
  })

  it('mustStop, genuine over-speed: too fast to fully stop within the edge, arrives with a nonzero residual instead of a nonsensical result', () => {
    const entry = vMax // 10
    const distance = 5 // less than the 10 needed to brake fully from entry=10 at a=5
    const motion = computeEdgeMotion(entry, vMax, acceleration, distance, true)
    expect(motion.decelStartMs).toBe(0)
    expect(motion.exitVelocity).toBeGreaterThan(0)
    expect(motion.exitVelocity).toBeLessThan(entry)
    expect(motion.exitVelocity).toBeCloseTo(Math.sqrt(entry ** 2 - 2 * acceleration * distance))
    expect(motion.travelMs).toBeGreaterThan(0)
    expect(Number.isFinite(motion.travelMs)).toBe(true)
  })

  it('!mustStop: never brakes, so decelStartMs is null', () => {
    const motion = computeEdgeMotion(0, vMax, acceleration, 100, false)
    expect(motion.decelStartMs).toBeNull()
  })
})

describe('computeNextEdgeMotion', () => {
  it('matches computeEdgeMotion fed the speed of light and computeAcceleration directly', () => {
    const progression = { momentumOwned: true, elapsedSecondsThisRun: 30, thrustersLevel: 3 }
    const v0 = 1.5
    const mustStop = true
    const expected = computeEdgeMotion(
      v0,
      PRODUCTION_CONFIG.speed.baseSpeedOfLight,
      computeAcceleration(progression.thrustersLevel, progression.momentumOwned, progression.elapsedSecondsThisRun),
      TEST_EDGE_WEIGHT,
      mustStop,
    )
    const actual = computeNextEdgeMotion(progression, v0, TEST_EDGE_WEIGHT, mustStop)
    expect(actual).toEqual(expected)
  })

  it('defaults speedOfLight to PRODUCTION_CONFIG.speed.baseSpeedOfLight', () => {
    const progression = { momentumOwned: false, elapsedSecondsThisRun: 0 }
    const withDefault = computeNextEdgeMotion(progression, 0, TEST_EDGE_WEIGHT, true)
    const withExplicitBase = computeNextEdgeMotion(progression, 0, TEST_EDGE_WEIGHT, true, PRODUCTION_CONFIG, PRODUCTION_CONFIG.speed.baseSpeedOfLight)
    expect(withDefault).toEqual(withExplicitBase)
  })

  it('the speed of light is the vMax — a raised value (FTL) raises cruise speed on a long edge', () => {
    // Long enough that the walker fully ramps up to vMax either way.
    const progression = { momentumOwned: false, elapsedSecondsThisRun: 0, thrustersLevel: 40 }
    const longEdgeWeight = 100_000
    const base = computeNextEdgeMotion(progression, 0, longEdgeWeight, false)
    expect(base.peakVelocity).toBe(PRODUCTION_CONFIG.speed.baseSpeedOfLight)

    const raised = computeNextEdgeMotion(progression, 0, longEdgeWeight, false, PRODUCTION_CONFIG, PRODUCTION_CONFIG.speed.baseSpeedOfLight * 2)
    expect(raised.peakVelocity).toBe(PRODUCTION_CONFIG.speed.baseSpeedOfLight * 2)
    expect(raised.travelMs).toBeLessThan(base.travelMs)
  })

  it('a short edge never reaches the speed of light — acceleration-limited, so raising c changes nothing', () => {
    const progression = { momentumOwned: false, elapsedSecondsThisRun: 0 }
    const below = computeNextEdgeMotion(progression, 0, TEST_EDGE_WEIGHT, true)
    expect(below.peakVelocity).toBeLessThan(PRODUCTION_CONFIG.speed.baseSpeedOfLight)
    const hugeC = computeNextEdgeMotion(progression, 0, TEST_EDGE_WEIGHT, true, PRODUCTION_CONFIG, PRODUCTION_CONFIG.speed.baseSpeedOfLight * 100)
    expect(below).toEqual(hugeC)
  })

  it('both Thrusters and Momentum feed into the acceleration used for the motion profile', () => {
    const noBonus = computeNextEdgeMotion({ momentumOwned: false, elapsedSecondsThisRun: 0, thrustersLevel: 0 }, 0, TEST_EDGE_WEIGHT, true)
    const withThrusters = computeNextEdgeMotion({ momentumOwned: false, elapsedSecondsThisRun: 0, thrustersLevel: 5 }, 0, TEST_EDGE_WEIGHT, true)
    const withMomentum = computeNextEdgeMotion({ momentumOwned: true, elapsedSecondsThisRun: 60, thrustersLevel: 0 }, 0, TEST_EDGE_WEIGHT, true)
    expect(withThrusters.travelMs).toBeLessThan(noBonus.travelMs)
    expect(withMomentum.travelMs).toBeLessThan(noBonus.travelMs)
  })
})

describe('velocityAtElapsedMs', () => {
  const vMax = 10
  const acceleration = 5

  it('tracks the accelerate/cruise/decelerate phases of a long mustStop edge', () => {
    const motion = computeEdgeMotion(0, vMax, acceleration, 100, true) // accel 2s, cruise 8s, decel 2s
    expect(velocityAtElapsedMs(motion, 0, acceleration)).toBeCloseTo(0)
    expect(velocityAtElapsedMs(motion, 1000, acceleration)).toBeCloseTo(5) // mid accel
    expect(velocityAtElapsedMs(motion, 2000, acceleration)).toBeCloseTo(10) // reaches vMax
    expect(velocityAtElapsedMs(motion, 6000, acceleration)).toBeCloseTo(10) // cruising
    expect(velocityAtElapsedMs(motion, 11000, acceleration)).toBeCloseTo(5) // mid decel
    expect(velocityAtElapsedMs(motion, motion.travelMs, acceleration)).toBeCloseTo(0) // arrival
  })

  it('stays at peakVelocity for the rest of a !mustStop edge once accelerating is done', () => {
    const motion = computeEdgeMotion(0, vMax, acceleration, 100, false)
    expect(velocityAtElapsedMs(motion, motion.accelEndMs, acceleration)).toBeCloseTo(vMax)
    expect(velocityAtElapsedMs(motion, motion.travelMs, acceleration)).toBeCloseTo(vMax)
  })

  it('clamps elapsed time outside [0, travelMs]', () => {
    const motion = computeEdgeMotion(0, vMax, acceleration, 100, true)
    expect(velocityAtElapsedMs(motion, -1000, acceleration)).toBeCloseTo(0)
    expect(velocityAtElapsedMs(motion, motion.travelMs + 10_000, acceleration)).toBeCloseTo(0)
  })
})

describe('computeDiscoverWaitMs', () => {
  it('is the base wait at level 0', () => {
    expect(computeDiscoverWaitMs(0)).toBe(PRODUCTION_CONFIG.speed.discoverWaitBaseMs)
  })

  it('shrinks by the compounding percent per level, uncapped, never reaching zero', () => {
    const level1 = computeDiscoverWaitMs(1)
    const level2 = computeDiscoverWaitMs(2)
    expect(level1).toBeCloseTo(PRODUCTION_CONFIG.speed.discoverWaitBaseMs * (1 - PRODUCTION_CONFIG.upgrades.discoverWait.percentPerLevel))
    expect(level2).toBeLessThan(level1)
    expect(computeDiscoverWaitMs(100)).toBeGreaterThan(0)
  })
})
