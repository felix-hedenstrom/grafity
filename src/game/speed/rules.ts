import type { GameConfig } from '../config/types'
import { PRODUCTION_CONFIG } from '../config/production'

/**
 * Speed/motion rules. All tunable numbers live in GameConfig (config/types.ts) — the speed of
 * light IS every walker's top speed, Spaceship and UFOs alike, with no per-walker engine speed
 * underneath it. Within a prestige cycle it's identical on every run; only the FTL prestige
 * upgrade raises it (computeFtlMultiplier in prestige/rules.ts, applied at the walkerScheduler
 * call site so this module stays ignorant of the Prestige Shop). In-run speed progression instead
 * comes from acceleration (Thrusters/Momentum): a walker only ever *reaches* c when an edge is
 * long enough to ramp all the way up.
 */

/** How long (ms) a walker pauses the first time it visits a node, at the given Quick Study level — each level shrinks the wait by percentPerLevel, compounding, never hitting zero. Zero wait on revisits is handled by the caller, not here. */
export function computeDiscoverWaitMs(discoverWaitLevel: number, config: GameConfig = PRODUCTION_CONFIG): number {
  return config.speed.discoverWaitBaseMs * (1 - config.upgrades.discoverWait.percentPerLevel) ** discoverWaitLevel
}

export interface SpeedProgression {
  /** Whether the one-time Momentum unlock is owned. */
  momentumOwned: boolean
  /** Real elapsed time in the current run (wall clock, not tick count) — deliberately not a lifetime total, so Momentum resets with each new graph. */
  elapsedSecondsThisRun: number
  /** How many Thrusters levels are owned — governs computeAcceleration, applied the same way to every walker regardless of role. Optional (defaults to 0, i.e. the base acceleration). */
  thrustersLevel?: number
}

/** The compounding per-second rate Momentum currently grants, before applying it over elapsed time. */
export function computeMomentumPercentPerSecond(momentumOwned: boolean, config: GameConfig = PRODUCTION_CONFIG): number {
  return momentumOwned ? config.upgrades.momentum.percentPerSecond : 0
}

/** How much more acceleration Momentum alone grants right now, as a multiplier (1 = no bonus yet), capped at its configured maxMultiplier. */
export function computeMomentumMultiplier(momentumOwned: boolean, elapsedSecondsThisRun: number, config: GameConfig = PRODUCTION_CONFIG): number {
  const raw = (1 + computeMomentumPercentPerSecond(momentumOwned, config)) ** elapsedSecondsThisRun
  return Math.min(config.upgrades.momentum.maxMultiplier, raw)
}

/** Distance/sec², before applying it to any particular edge's crossing. Applies uniformly to every walker (Spaceship and UFOs alike) — nothing here scales by role. Thrusters compounds on the base rate; Momentum stacks multiplicatively on top, time-compounding within the current run (see computeMomentumMultiplier) and capped at its maxMultiplier. The base value is tuned as a pair with graph.spacingAtReferenceCount — see PRODUCTION_CONFIG before retuning either. */
export function computeAcceleration(thrustersLevel: number, momentumOwned = false, elapsedSecondsThisRun = 0, config: GameConfig = PRODUCTION_CONFIG): number {
  const base = config.speed.baseAccelerationDistancePerSecondSquared * (1 + config.upgrades.thrusters.percentPerLevel) ** thrustersLevel
  const momentumMultiplier = computeMomentumMultiplier(momentumOwned, elapsedSecondsThisRun, config)
  return base * momentumMultiplier
}

export interface EdgeMotion {
  /** Speed the walker had entering this edge (after clamping to vMax). */
  entryVelocity: number
  /** The fastest this edge crossing ever gets — vMax if it cruises (or tops out exactly at vMax), otherwise the solved peak of a triangular profile, or just entryVelocity itself for an edge that brakes immediately with no further acceleration at all. */
  peakVelocity: number
  /** ms into this edge's crossing when acceleration stops (reaches peakVelocity) — 0 if it was already at peak (or past it, braking immediately) on entry. */
  accelEndMs: number
  /** ms into this edge's crossing when braking begins — null if this edge never brakes (mustStop = false, carrying speed on into the next edge). Equal to accelEndMs when there's no cruise segment between them. */
  decelStartMs: number | null
  /** How long (ms) this edge crossing takes under the accel/cruise/decel profile above. */
  travelMs: number
  /** Speed the walker is moving at the instant it reaches the far node — 0 if it braked to a stop (mustStop), otherwise whatever it had ramped up to, carried into the next edge as that edge's entry speed. */
  exitVelocity: number
}

/** Floored at minTickIntervalMs — a presentation-driven minimum so motion stays visible. */
function msFromSeconds(seconds: number, minTickIntervalMs: number): number {
  return Math.max(minTickIntervalMs, Math.round(seconds * 1000))
}

/**
 * Rocket-style motion for one edge crossing: accelerate from the entry speed v0 toward the top
 * speed vMax, then either brake to a full stop by the far end (mustStop — an unvisited node the
 * walker actually needs to stand on and decide from) or just keep going at whatever speed it
 * reached, carrying that velocity into the next edge instead of braking and re-accelerating for
 * no reason (a node it's already visited, so there's nothing to stop and decide about).
 *
 * mustStop handles any entry velocity correctly, not just departing from rest: if there's still
 * room to accelerate before braking is required, it does (reaching vMax and cruising if the edge
 * is long enough, otherwise a triangular profile whose peak sits at exactly half the distance
 * when entry is 0 — the common rest-to-rest case). If the walker is already moving too fast to
 * accelerate any further without overshooting, it brakes immediately (decelStartMs = 0) — and if
 * it's moving so fast that it can't even fully stop within the remaining distance (a very short
 * edge right after a fast cruise), it brakes as hard as possible and arrives with whatever speed
 * is physically left rather than producing a nonsensical negative-time result.
 */
export function computeEdgeMotion(
  v0: number,
  vMax: number,
  acceleration: number,
  distance: number,
  mustStop: boolean,
  minTickIntervalMs = PRODUCTION_CONFIG.speed.minTickIntervalMs,
): EdgeMotion {
  const entry = Math.min(v0, vMax)

  if (mustStop) {
    const stopOnlyDistance = entry ** 2 / (2 * acceleration)
    if (stopOnlyDistance >= distance) {
      // No room left to accelerate further — brake immediately, possibly not even fully in time.
      const exitVelocity = Math.sqrt(Math.max(0, entry ** 2 - 2 * acceleration * distance))
      const decelTime = (entry - exitVelocity) / acceleration
      const travelMs = msFromSeconds(decelTime, minTickIntervalMs)
      return { entryVelocity: entry, peakVelocity: entry, accelEndMs: 0, decelStartMs: 0, travelMs, exitVelocity }
    }

    const accelDistance = (vMax ** 2 - entry ** 2) / (2 * acceleration)
    const decelDistance = vMax ** 2 / (2 * acceleration)
    if (accelDistance + decelDistance <= distance) {
      const cruiseDistance = distance - accelDistance - decelDistance
      const accelTime = (vMax - entry) / acceleration
      const cruiseTime = cruiseDistance / vMax
      const decelTime = vMax / acceleration
      const travelMs = msFromSeconds(accelTime + cruiseTime + decelTime, minTickIntervalMs)
      const accelEndMs = Math.min(travelMs, Math.round(accelTime * 1000))
      const decelStartMs = Math.min(travelMs, Math.round((accelTime + cruiseTime) * 1000))
      return { entryVelocity: entry, peakVelocity: vMax, accelEndMs, decelStartMs, travelMs, exitVelocity: 0 }
    }
    // Triangular profile: the edge is too short to ever reach vMax — solve for the peak speed
    // at which the accel leg and the decel-to-zero leg exactly add up to the whole distance.
    // (entry is 0 or small enough here that this is always reachable — the stopOnlyDistance
    // check above already ruled out the case where entry is too fast for any accel leg at all.)
    const peak = Math.sqrt((2 * acceleration * distance + entry ** 2) / 2)
    const accelTime = (peak - entry) / acceleration
    const decelTime = peak / acceleration
    const travelMs = msFromSeconds(accelTime + decelTime, minTickIntervalMs)
    const accelEndMs = Math.min(travelMs, Math.round(accelTime * 1000))
    return { entryVelocity: entry, peakVelocity: peak, accelEndMs, decelStartMs: accelEndMs, travelMs, exitVelocity: 0 }
  }

  const accelDistance = (vMax ** 2 - entry ** 2) / (2 * acceleration)
  if (accelDistance >= distance) {
    // Still accelerating when it reaches the far node — carries that lower speed on.
    const exitVelocity = Math.sqrt(entry ** 2 + 2 * acceleration * distance)
    const accelTime = (exitVelocity - entry) / acceleration
    const travelMs = msFromSeconds(accelTime, minTickIntervalMs)
    return { entryVelocity: entry, peakVelocity: exitVelocity, accelEndMs: travelMs, decelStartMs: null, travelMs, exitVelocity }
  }
  const cruiseDistance = distance - accelDistance
  const accelTime = (vMax - entry) / acceleration
  const cruiseTime = cruiseDistance / vMax
  const travelMs = msFromSeconds(accelTime + cruiseTime, minTickIntervalMs)
  const accelEndMs = Math.min(travelMs, Math.round(accelTime * 1000))
  return { entryVelocity: entry, peakVelocity: vMax, accelEndMs, decelStartMs: null, travelMs, exitVelocity: vMax }
}

/**
 * The motion profile for one edge crossing, assembled from top speed (the speed of light — the
 * same vMax for every walker) and acceleration (computeAcceleration, Thrusters + Momentum) the
 * same way everywhere this is needed — the real scheduler (walkerScheduler.ts) and the offline
 * balance simulator (src/sim/runSimulation.ts) both call this, so they can't drift apart on the
 * core physics. speedOfLight is raised above the config's baseSpeedOfLight only by the permanent
 * cross-run FTL upgrade, which lives outside this module's pure SpeedProgression/upgrade-level
 * inputs; omit it where there are no prestige bonuses (the simulator never has any, by design —
 * see its module docstring).
 */
export function computeNextEdgeMotion(
  progression: SpeedProgression,
  v0: number,
  edgeWeight: number,
  mustStop: boolean,
  config: GameConfig = PRODUCTION_CONFIG,
  speedOfLight = config.speed.baseSpeedOfLight,
): EdgeMotion {
  const acceleration = computeAcceleration(progression.thrustersLevel ?? 0, progression.momentumOwned, progression.elapsedSecondsThisRun, config)
  return computeEdgeMotion(v0, speedOfLight, acceleration, edgeWeight, mustStop, config.speed.minTickIntervalMs)
}

/**
 * The instantaneous speed at elapsedMs into an edge crossing, from the same phase breakdown
 * computeEdgeMotion already solved — accelerating up to peakVelocity, cruising there if there's a
 * gap between accelEndMs and decelStartMs, then braking down to exitVelocity. Used for both the
 * retrograde-flip timing (is elapsedMs past decelStartMs?) and any live speed readout, so the
 * phase math lives in exactly one place.
 */
export function velocityAtElapsedMs(motion: EdgeMotion, elapsedMs: number, acceleration: number): number {
  const t = Math.max(0, Math.min(elapsedMs, motion.travelMs))
  if (t <= motion.accelEndMs) {
    return motion.entryVelocity + acceleration * (t / 1000)
  }
  if (motion.decelStartMs === null || t <= motion.decelStartMs) {
    return motion.peakVelocity
  }
  const decelSeconds = (t - motion.decelStartMs) / 1000
  return Math.max(motion.exitVelocity, motion.peakVelocity - acceleration * decelSeconds)
}
