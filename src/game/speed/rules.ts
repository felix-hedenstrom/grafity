export const MIN_TICK_INTERVAL_MS = 150
/** How long the goal-reached celebration holds walkers in place before the graph resets — fixed, not derived from any edge/speed math, roughly matching GraphView's burst/banner CSS animations (1.8s) so they finish playing first. */
export const CELEBRATION_HOLD_MS = 1500
/** A "typical" edge (around BASE_POINT_SPACING long) takes about 2 seconds to cross at base speed — same pace as the old fixed tick interval, just now scaled by each edge's actual weight/distance instead of being constant. */
export const BASE_DISTANCE_PER_SECOND = 30

/** Quick Steps is repeatable — each purchase adds a flat +6 distance/sec to the base rate, uncapped (20% of base speed per level, same proportion as before). */
export const QUICK_STEPS_SPEED_PER_LEVEL = 6
export const QUICK_STEPS_BASE_COST = 60
export const QUICK_STEPS_COST_GROWTH = 1.1

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

/** Distance/sec, before applying it to any particular edge's weight. */
export function computeDistancePerSecond(progression: SpeedProgression): number {
  const base = BASE_DISTANCE_PER_SECOND + progression.quickStepsLevel * QUICK_STEPS_SPEED_PER_LEVEL
  if (progression.momentumLevel === 0) return base
  return base * computeMomentumMultiplier(progression.momentumLevel, progression.elapsedSecondsThisRun)
}

/** How long (ms) it takes one walker to cross one edge of the given weight (distance) at the current speed. */
export function computeEdgeTravelMs(progression: SpeedProgression, edgeWeight: number): number {
  const interval = (1000 * edgeWeight) / computeDistancePerSecond(progression)
  return Math.max(MIN_TICK_INTERVAL_MS, Math.round(interval))
}
