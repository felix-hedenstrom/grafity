export const BASE_TICK_INTERVAL_MS = 2000
export const MIN_TICK_INTERVAL_MS = 150
export const BASE_EDGES_PER_SECOND = 1000 / BASE_TICK_INTERVAL_MS

/** Quick Steps is repeatable — each purchase adds a flat +0.1 edges/sec to the base rate, uncapped. */
export const QUICK_STEPS_SPEED_PER_LEVEL = 0.1
export const QUICK_STEPS_BASE_COST = 60
export const QUICK_STEPS_COST_GROWTH = 1.1

/** Momentum is repeatable rather than a single owned/not-owned upgrade — each purchase adds one level, uncapped. */
export const MOMENTUM_PERCENT_PER_LEVEL = 0.005
export const MOMENTUM_BASE_COST = 50
/** Each level costs this much more than the last — geometric, not flat. */
export const MOMENTUM_COST_GROWTH = 1.12
/** However much momentum stacks, the speed bonus it grants never exceeds +200% (3x). */
export const MOMENTUM_MAX_MULTIPLIER = 3

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

export function computeTickIntervalMs(progression: SpeedProgression): number {
  const edgesPerSecond = BASE_EDGES_PER_SECOND + progression.quickStepsLevel * QUICK_STEPS_SPEED_PER_LEVEL
  let interval = 1000 / edgesPerSecond

  if (progression.momentumLevel > 0) {
    interval /= computeMomentumMultiplier(progression.momentumLevel, progression.elapsedSecondsThisRun)
  }

  return Math.max(MIN_TICK_INTERVAL_MS, Math.round(interval))
}

export function computeEdgesPerSecond(intervalMs: number): number {
  return 1000 / intervalMs
}
