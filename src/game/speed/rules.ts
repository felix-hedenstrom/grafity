export const MIN_TICK_INTERVAL_MS = 150
/** How long the goal-reached celebration holds walkers in place before the graph resets — fixed, not derived from any edge/speed math, roughly matching GraphView's burst/banner CSS animations (1.8s) so they finish playing first. */
export const CELEBRATION_HOLD_MS = 1500
/** A "typical" edge (around BASE_POINT_SPACING long) takes about 4 seconds to cross at base speed — halved from the original 30 distance/sec tuning. */
export const BASE_DISTANCE_PER_SECOND = 15

/** Quick Steps is repeatable — each purchase adds a flat +6 distance/sec to the base rate, uncapped (20% of base speed per level, same proportion as before). */
export const QUICK_STEPS_SPEED_PER_LEVEL = 6
export const QUICK_STEPS_BASE_COST = 60
export const QUICK_STEPS_COST_GROWTH = 1.1

/** Main Walker Speed is repeatable and only ever applies to the Spaceship (walkers[0]) — every UFO ignores it entirely. Same per-level bump as Quick Steps, but gated behind it conceptually since it only matters once there's more than one walker to outrun. */
export const MAIN_WALKER_SPEED_PER_LEVEL = 6
export const MAIN_WALKER_SPEED_BASE_COST = 800
export const MAIN_WALKER_SPEED_COST_GROWTH = 1.3

/** UFO Speed is repeatable but capped — every UFO (every walker besides the Spaceship) travels at this fraction of the Spaceship's current speed, buyable in 1-point steps up to UFO_SPEED_RATIO_MAX. */
export const UFO_SPEED_RATIO_BASE = 0.5
export const UFO_SPEED_RATIO_PERCENT_PER_LEVEL = 0.01
export const UFO_SPEED_RATIO_MAX = 0.75
export const UFO_SPEED_MAX_LEVEL = Math.round((UFO_SPEED_RATIO_MAX - UFO_SPEED_RATIO_BASE) / UFO_SPEED_RATIO_PERCENT_PER_LEVEL)
export const UFO_SPEED_BASE_COST = 500
export const UFO_SPEED_COST_GROWTH = 1.25

/** Momentum is repeatable rather than a single owned/not-owned upgrade — each purchase adds one level, uncapped. */
export const MOMENTUM_PERCENT_PER_LEVEL = 0.005
export const MOMENTUM_BASE_COST = 50
/** Each level costs this much more than the last — geometric, not flat. */
export const MOMENTUM_COST_GROWTH = 1.12
/** However much momentum stacks, the speed bonus it grants never exceeds +200% (3x). */
export const MOMENTUM_MAX_MULTIPLIER = 3

/** How long a walker pauses on a node the first time it visits it — "discovering" it — before departing again. Revisits never pay this; see computeDiscoverWaitMs. */
export const DISCOVER_WAIT_BASE_MS = 1200
/** Quick Study is repeatable — each purchase shrinks the discover wait by another 5%, compounding, uncapped (same shape as Momentum: always buyable, diminishing returns, never hits zero). */
export const DISCOVER_WAIT_PERCENT_PER_LEVEL = 0.05
export const DISCOVER_WAIT_BASE_COST = 55
export const DISCOVER_WAIT_COST_GROWTH = 1.1

/** How long (ms) a walker pauses the first time it visits a node, at the given Quick Study level. Zero wait on revisits is handled by the caller, not here. */
export function computeDiscoverWaitMs(discoverWaitLevel: number): number {
  return DISCOVER_WAIT_BASE_MS * (1 - DISCOVER_WAIT_PERCENT_PER_LEVEL) ** discoverWaitLevel
}

export interface SpeedProgression {
  quickStepsLevel: number
  momentumLevel: number
  /** Real elapsed time in the current run (wall clock, not tick count) — deliberately not a lifetime total, so Momentum resets with each new graph. */
  elapsedSecondsThisRun: number
  /** How many Main Walker Speed levels are owned — applied only when computeDistancePerSecond/computeEdgeTravelMs are called with isMainWalker true. Optional (defaults to 0) so existing call sites that never heard of this upgrade keep working untouched. */
  mainWalkerSpeedLevel?: number
  /** How many UFO Speed levels are owned — applied only when isMainWalker is false, scaling the Spaceship's fully-computed speed down to the UFO's ratio. Optional (defaults to 0, i.e. UFO_SPEED_RATIO_BASE). */
  ufoSpeedLevel?: number
}

/** The compounding per-second rate Momentum currently grants, before applying it over elapsed time. */
export function computeMomentumPercentPerSecond(momentumLevel: number): number {
  return MOMENTUM_PERCENT_PER_LEVEL * momentumLevel
}

/** How much faster Momentum alone makes you right now, as a multiplier (1 = no bonus yet), capped at MOMENTUM_MAX_MULTIPLIER. */
export function computeMomentumMultiplier(momentumLevel: number, elapsedSecondsThisRun: number): number {
  const raw = (1 + computeMomentumPercentPerSecond(momentumLevel)) ** elapsedSecondsThisRun
  return Math.min(MOMENTUM_MAX_MULTIPLIER, raw)
}

/** How fast a UFO travels right now, as a fraction of the Spaceship's current speed — starts at UFO_SPEED_RATIO_BASE, rises by UFO_SPEED_RATIO_PERCENT_PER_LEVEL per purchase, capped at UFO_SPEED_RATIO_MAX regardless of level. */
export function computeUfoSpeedRatio(ufoSpeedLevel = 0): number {
  return Math.min(UFO_SPEED_RATIO_MAX, UFO_SPEED_RATIO_BASE + ufoSpeedLevel * UFO_SPEED_RATIO_PERCENT_PER_LEVEL)
}

/** Distance/sec, before applying it to any particular edge's weight. isMainWalker adds Main Walker Speed's bonus on top; a UFO instead takes that same fully-computed Spaceship speed and scales it down by computeUfoSpeedRatio, so every other speed upgrade carries over proportionally. */
export function computeDistancePerSecond(progression: SpeedProgression, isMainWalker = false): number {
  const mainWalkerBonus = (progression.mainWalkerSpeedLevel ?? 0) * MAIN_WALKER_SPEED_PER_LEVEL
  const base = BASE_DISTANCE_PER_SECOND + progression.quickStepsLevel * QUICK_STEPS_SPEED_PER_LEVEL + mainWalkerBonus
  const withMomentum =
    progression.momentumLevel === 0 ? base : base * computeMomentumMultiplier(progression.momentumLevel, progression.elapsedSecondsThisRun)
  return isMainWalker ? withMomentum : withMomentum * computeUfoSpeedRatio(progression.ufoSpeedLevel)
}

/** How long (ms) it takes one walker to cross one edge of the given weight (distance) at the current speed. isMainWalker only matters for walkers[0] — see computeDistancePerSecond. */
export function computeEdgeTravelMs(progression: SpeedProgression, edgeWeight: number, isMainWalker = false): number {
  const interval = (1000 * edgeWeight) / computeDistancePerSecond(progression, isMainWalker)
  return Math.max(MIN_TICK_INTERVAL_MS, Math.round(interval))
}
