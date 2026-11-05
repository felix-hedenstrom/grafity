/** How long one full revolution takes at cruise angular speed — matches the old CSS keyframe
 * orbit's 1.1s period, so the familiar pace is unchanged; only the entry/exit are new. */
export const ORBIT_PERIOD_MS = 1100

/** Rests shorter than this skip the orbit entirely (high Quick Study levels) — there isn't room
 * for the spiral out and back to read as anything but a twitch, so the ship just sits instead. */
export const MIN_ORBIT_WAIT_MS = 700

/** Each end of the rest spends this fraction of the total wait spiraling (out at the start, back
 * in at the end), capped so very long waits don't ramp forever. Never exceeds 0.3 of the wait,
 * so a cruise segment of at least 0.4·waitMs always exists between the two ramps. */
const rampMs = (waitMs: number) => Math.min(waitMs * 0.3, 800)

/** Classic smoothstep: zero value and zero slope at u=0, value 1 and zero slope at u=1. Zero
 * end slopes are what make the orbit seamless — radial and angular velocity are both genuinely
 * zero at t=0 and t=waitMs, matching the physics stop before the rest and the glide after it. */
const smooth = (u: number) => u * u * (3 - 2 * u)
const smoothDeriv = (u: number) => 6 * u * (1 - u)
/** ∫₀ᵘ smooth — closed form for the phase swept during a ramp. ismooth(1) = 1/2. */
const ismooth = (u: number) => u ** 3 - u ** 4 / 2

export interface OrbitFrame {
  /** Offset from the node center, px. */
  x: number
  y: number
  /** Direction of travel right now, degrees — undefined-ish when speed is ~0 (the endpoints);
   * callers should hold their previous nose whenever speed is below their epsilon. */
  noseDeg: number
  /** |velocity| in px/ms — lets the caller detect the stationary endpoints. */
  speed: number
}

/**
 * The discovering orbit as one continuous parametric curve over the whole rest window
 * [0, waitMs]: spiral out from the node center (radius and angular velocity both
 * smoothstep-ramped from zero), cruise a circle of the given radius at ORBIT_PERIOD_MS per
 * revolution, then mirror the ramp back down to rest at the center exactly at waitMs. The entry
 * phase is seeded from entryNoseDeg, so at t→0⁺ the velocity is purely radial along the ship's
 * current nose — it drifts off exactly where it's already pointing, with no snap. Revolutions
 * adapt to the wait (sweep = ω_max·(waitMs − rampMs)); the end phase is irrelevant because the
 * radius is zero there. Positive phase sweeps clockwise on screen (SVG y-down), same as the old
 * keyframes.
 */
export function orbitFrameAt(tMs: number, waitMs: number, radius: number, entryNoseDeg: number): OrbitFrame {
  const T = waitMs
  const Tr = rampMs(T)
  const omegaMax = 360 / ORBIT_PERIOD_MS // deg per ms at cruise
  const t = Math.max(0, Math.min(tMs, T))

  let r: number // px
  let rDot: number // px per ms
  let theta: number // deg
  let thetaDot: number // deg per ms
  if (t < Tr) {
    const u = t / Tr
    r = radius * smooth(u)
    rDot = (radius * smoothDeriv(u)) / Tr
    theta = entryNoseDeg + omegaMax * Tr * ismooth(u)
    thetaDot = omegaMax * smooth(u)
  } else if (t <= T - Tr) {
    r = radius
    rDot = 0
    theta = entryNoseDeg + omegaMax * Tr * 0.5 + omegaMax * (t - Tr)
    thetaDot = omegaMax
  } else {
    const v = (T - t) / Tr
    const thetaTotal = entryNoseDeg + omegaMax * (T - Tr) // phase at t = T (both ramps sweep ω_max·Tr/2)
    r = radius * smooth(v)
    rDot = -(radius * smoothDeriv(v)) / Tr
    theta = thetaTotal - omegaMax * Tr * ismooth(v)
    thetaDot = omegaMax * smooth(v)
  }

  const thetaRad = (theta * Math.PI) / 180
  const thetaDotRad = (thetaDot * Math.PI) / 180
  const cos = Math.cos(thetaRad)
  const sin = Math.sin(thetaRad)
  const vx = rDot * cos - r * thetaDotRad * sin
  const vy = rDot * sin + r * thetaDotRad * cos

  return {
    x: r * cos,
    y: r * sin,
    noseDeg: (Math.atan2(vy, vx) * 180) / Math.PI,
    speed: Math.hypot(vx, vy),
  }
}
