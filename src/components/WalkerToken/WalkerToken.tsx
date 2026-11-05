import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MIN_ORBIT_WAIT_MS } from './orbitMath'
import { useNodeOrbit } from './useNodeOrbit'
import styles from './WalkerToken.module.css'

/** Cached once — rests last seconds, so reading .matches at each orbit activation is plenty
 * responsive to the OS setting changing. Guarded for test environments without matchMedia. */
const reducedMotionQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null

interface WalkerTokenProps {
  x: number
  y: number
  /** The current transit's duration (ms). Not an animation input — x/y already arrive
   * pre-interpolated per frame — but travelMs === 0 is the "sitting still" signal that gates the
   * discovering orbit, thrusters, and heading unwrap below. */
  travelMs: number
  /** Date.now() when the current discover pause began — set (with restWaitMs) only during a real discovering stop, absent for every other kind of sitting still (initial rest, boxed-in retries, revisits, celebration). Together they drive the timed discovering orbit; without them the ship simply rests nose-steady at the node. */
  restStartedAt?: number
  /** How long the current discover pause lasts — the orbit's full cycle (spiral out, cruise, spiral back to rest at the center) is timed to fill exactly this window, so departure always starts from the node center. */
  restWaitMs?: number
  /** Heading in degrees: the edge currently being crossed while traveling, or the last edge arrived on while sitting still. Points the ship's nose and anchors the discovering orbit's exit heading. This is the *prograde* heading (nose toward the destination) — the component itself flips it 180° during the braking portion of a transit, see decelStartMs below. */
  angle: number
  /** Date.now() when the current transit started — paired with decelStartMs so the component can time its own retrograde flip, and so a brand-new transit (a different startedAt) resets any flip left over from the previous one. Irrelevant while travelMs is 0 (sitting still). */
  startedAt?: number
  /** ms into the current transit when braking begins — the component flips 180° (nose pointed backward, engines firing forward, like a real retrograde burn) at exactly this point and flips back to prograde at the start of the next transit. null/undefined means this transit never brakes (cruising or carrying speed through a visited node), so it stays prograde the whole way. */
  decelStartMs?: number | null
  /** ms into the current transit when acceleration stops (reaches peak speed) — paired with decelStartMs to mark the transit's constant-speed cruise segment, where the thruster exhaust hides since no thrust is actually firing. Thrusters show from transit start until accelEndMs (0 means the walker departed already at peak speed, so no burn at all), hide until decelStartMs (if any), then show again for the braking segment. undefined (sitting still) keeps them hidden. */
  accelEndMs?: number
  /** The rendered radius of the star/beacon this walker is currently standing on, so its discovering orbit always clears that specific node's actual size instead of a guessed constant — a degree-4 hub and a plain degree-2 star get differently sized orbits. */
  nodeRadius: number
  /** 'reverse' is the second walker in Bidirectional Search (starting from the exit); 'main' is walkers[0] — the one the camera follows and whose own arrival at the goal ends the run. 'main' renders as the rocket; 'forward'/'reverse' render as tinted UFO sub-ships so all three stay readable as different roles. */
  variant?: 'forward' | 'reverse' | 'main'
  /** Multiplies the ship's rendered size, so it can be scaled up as the camera's viewBox window
   * grows on big, spread-out graphs (high levels) — without this, ships shrink 1:1 with
   * everything else in view until barely visible. Defaults to 1 (today's fixed size). */
  scale?: number
}

/** Orbit radius margin beyond the node's own rendered radius, so the ship's flight circle clears
 * the star's halo rather than clipping through it. Ship-sized, so it's the only part of the orbit
 * radius multiplied by the walker scale — nodeRadius already carries the graph's spacing scale,
 * and scaling it again would blow the orbit up quadratically on big graphs. */
const ORBIT_MARGIN = 5

/** The orbit circle itself is scaled down from the node-clearing radius above — a full
 * node-sized loop read as oversized next to the ship, so only half of it is actually used. */
const ORBIT_SCALE = 0.5

/** The outer group's translate() is set directly from the x/y props each render — no CSS
 * transition. The caller (GraphView) passes the walker's live interpolated position from
 * useInterpolatedPositions every animation frame, so the ship, the reveal-line endpoint, and the
 * camera all read the one shared value and can never drift apart. (An earlier version instead
 * transitioned to the destination node via CSS easing keywords, which desynced from the JS-eased
 * reveal line: same easing names, different curves, different start clocks.) A nested inner group
 * carries the heading rotation and the discovering orbit, kept separate so they don't fight the
 * position for the same transform. Every ship class shares the same discovering gesture — a real
 * orbit around the node, timed to fill the discover wait exactly (see useNodeOrbit) — so
 * "investigating" reads as one consistent language across the main ship and every UFO sub-ship,
 * not a different motion per shape. */
export function WalkerToken({
  x,
  y,
  travelMs,
  angle,
  nodeRadius,
  variant = 'forward',
  scale = 1,
  startedAt,
  decelStartMs,
  accelEndMs,
  restStartedAt,
  restWaitMs,
}: WalkerTokenProps) {
  const resting = travelMs === 0
  const isMain = variant === 'main'

  // Retrograde burn: flip 180° (nose backward, engines firing forward) for exactly the braking
  // portion of a transit. Scheduled with its own timer rather than derived every render, since the
  // flip is a one-time event at a specific future wall-clock moment, not something that needs
  // continuous per-frame recomputation — the same reasoning as the discovering-orbit hand-off
  // logic below. Keyed on startedAt (not just decelStartMs) so a brand-new transit always resets
  // the flip even if it happens to share the same decelStartMs as the one before it.
  const [retrograde, setRetrograde] = useState(false)
  useEffect(() => {
    const alreadyBraking = decelStartMs != null && startedAt != null && decelStartMs - (Date.now() - startedAt) <= 0
    if (retrograde !== alreadyBraking) setRetrograde(alreadyBraking)
    if (decelStartMs == null || startedAt == null || alreadyBraking) return
    const remaining = decelStartMs - (Date.now() - startedAt)
    const timer = setTimeout(() => setRetrograde(true), remaining)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, decelStartMs])

  const effectiveAngle = retrograde ? angle + 180 : angle

  // Thrusters only actually fire while the ship's speed is changing: the ramp-up at the start of
  // a transit, and (if this transit brakes) the retrograde burn at the end. The flat-speed cruise
  // segment in between — and sitting still — gets no exhaust. Scheduled the same way as the
  // retrograde flip above: a one-time future event per phase boundary rather than continuous
  // per-frame recomputation.
  const isThrusting = (elapsedMs: number) => elapsedMs < (accelEndMs ?? 0) || (decelStartMs != null && elapsedMs >= decelStartMs)
  const [thrustActive, setThrustActive] = useState(false)
  useEffect(() => {
    if (startedAt == null || accelEndMs == null) {
      setThrustActive(false)
      return
    }
    const elapsedNow = Date.now() - startedAt
    setThrustActive(isThrusting(elapsedNow))
    const timers: ReturnType<typeof setTimeout>[] = []
    if (elapsedNow < accelEndMs) {
      timers.push(setTimeout(() => setThrustActive(false), accelEndMs - elapsedNow))
    }
    if (decelStartMs != null && elapsedNow < decelStartMs) {
      timers.push(setTimeout(() => setThrustActive(true), decelStartMs - elapsedNow))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, accelEndMs, decelStartMs])

  const headingRef = useRef<SVGGElement>(null)
  const unwrappedAngleRef = useRef(effectiveAngle)
  const [displayAngle, setDisplayAngle] = useState(effectiveAngle)

  // The discovering orbit only plays during a real discover pause (rest props present), when
  // there's room for the spiral out/back to read as motion rather than a twitch, and when the
  // user hasn't asked for reduced motion. Every other kind of sitting still — initial rest,
  // boxed-in waits, revisits, celebration — just holds the ship nose-steady at the node (a
  // deliberate change from the old always-looping CSS orbit).
  const orbitActive =
    resting &&
    restStartedAt != null &&
    restWaitMs != null &&
    restWaitMs >= MIN_ORBIT_WAIT_MS &&
    !reducedMotionQuery?.matches

  useNodeOrbit({
    active: orbitActive,
    startedAt: restStartedAt,
    waitMs: restWaitMs,
    radius: (nodeRadius + ORBIT_MARGIN * scale) * ORBIT_SCALE,
    headingEl: headingRef,
    unwrappedAngleRef,
  })

  // Keep the rendered heading within a half-turn of wherever the nose actually is, so every
  // turn transitions the short way around instead of unwinding whole revolutions. Skipped while
  // resting: the nose then is wherever physics left it (retrograde after a braking arrival) or
  // wherever the orbit is steering it — syncing effectiveAngle here would visibly un-flip the
  // ship 180° the moment the retrograde state resets. unwrappedAngleRef stays live regardless
  // (the orbit hook writes it every frame), so the unwrap at the next departure still turns
  // ≤180° from the true final nose.
  useLayoutEffect(() => {
    if (resting) return
    const base = unwrappedAngleRef.current
    const delta = ((((effectiveAngle - base) % 360) + 540) % 360) - 180
    const next = base + delta
    unwrappedAngleRef.current = next
    setDisplayAngle(next)
  }, [effectiveAngle, resting])

  return (
    <g className={styles.position} style={{ transform: `translate(${x}px, ${y}px)` }}>
      <g
        ref={headingRef}
        className={[styles.heading, variant === 'reverse' ? styles.reverse : ''].filter(Boolean).join(' ')}
        style={{
          // While the orbit is active its rAF loop owns this transform outright (imperative
          // writes via headingRef); rendering undefined here keeps React from stomping those
          // writes on unrelated re-renders. The hook's first frame lands in the same commit
          // (layout effect, pre-paint), so the brief removal never reaches the screen.
          transform: orbitActive ? undefined : `rotate(${displayAngle}deg)`,
        }}
      >
        {/* Scale lives on its own group, separate from .heading above: .heading's transform is
            fully owned by the orbit's per-frame writes while discovering, which would silently
            drop a scale(scale) factor placed there instead. Nesting it here means the ship's
            rendered size stays correct in both the traveling and discovering states. */}
        <g style={{ transform: `scale(${scale})`, transformOrigin: '0px 0px' } as CSSProperties}>
          {isMain ? (
            <>
              <defs>
                <linearGradient id="metalGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#7a8099" />
                  <stop offset="100%" stopColor="#2c3047" />
                </linearGradient>
                <radialGradient id="glassGrad" cx="35%" cy="35%" r="75%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="35%" stopColor="#d6f6ff" />
                  <stop offset="100%" stopColor="#6ee7ff" />
                </radialGradient>
                <linearGradient id="hullGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d9dce2" />
                  <stop offset="50%" stopColor="#9196a3" />
                  <stop offset="100%" stopColor="#686c79" />
                </linearGradient>
                <clipPath id="hullClip">
                  <polygon points="14,0 0.58,-8.22 -9.69,-6.47 -8,0 -9.69,6.47 0.58,8.22" />
                </clipPath>
                <linearGradient id="outerClassic" x1="1" y1="0.5" x2="0" y2="0.5">
                  <stop offset="0%" stopColor="#ffd36b" stopOpacity="0.95" />
                  <stop offset="28%" stopColor="#ff5a1f" stopOpacity="0.9" />
                  <stop offset="62%" stopColor="#c81e1e" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#3a0a0a" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="midClassic" x1="1" y1="0.5" x2="0" y2="0.5">
                  <stop offset="0%" stopColor="#fff2b0" stopOpacity="0.95" />
                  <stop offset="40%" stopColor="#ffb13a" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ff5a1f" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="coreClassic" x1="1" y1="0.5" x2="0" y2="0.5">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="55%" stopColor="#fff6d0" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ffe9a8" stopOpacity="0" />
                </linearGradient>
              </defs>

              <ellipse className={styles.hullHalo} cx="-1" cy="0" rx="11" ry="7" />

              {/* Twin wingtip-engine flame rigs — always mounted (never conditionally rendered)
                  so the group's bounding box never shifts between states; only opacity toggles
                  based on whether thrust is actually firing right now. */}
              {([-4.65, 4.65] as const).map((engineY, i) => (
                <g
                  key={engineY}
                  className={[styles.flameRig, !resting && thrustActive ? styles.flameActive : ''].filter(Boolean).join(' ')}
                  transform={`translate(-8.33,${engineY}) scale(0.55)`}
                >
                  <g className={styles.smoke}>
                    <circle cx="-30" cy={i === 0 ? -0.8 : 0.8} r="1.5" style={{ '--dur': '2.6s', '--delay': i === 0 ? '0s' : '0.2s', '--rise': i === 0 ? '-4px' : '4px' } as CSSProperties} />
                  </g>
                  <g className={styles.plume}>
                    <path className={styles.outerBase} fill="url(#outerClassic)" d="M -5,-5 C -12,-6.5 -20,-5 -26,-2.5 C -30,-1 -33,0 -35,0 C -33,0 -30,1 -26,2.5 C -20,5 -12,6.5 -5,5 Z" />
                    <g className={styles.outerA} transform={i === 0 ? 'rotate(-6) translate(0,-1.2)' : 'rotate(6) translate(0,1.2)'}>
                      <path fill="url(#outerClassic)" d="M -5,-5 C -12,-6.5 -20,-5 -26,-2.5 C -30,-1 -33,0 -35,0 C -33,0 -30,1 -26,2.5 C -20,5 -12,6.5 -5,5 Z" />
                    </g>
                    <path className={styles.mid} fill="url(#midClassic)" d="M -5,-3.4 C -10,-4.3 -16,-3.4 -20,-1.8 C -23,-0.8 -24.5,0 -26,0 C -24.5,0 -23,0.8 -20,1.8 C -16,3.4 -10,4.3 -5,3.4 Z" />
                    <path className={styles.core} fill="url(#coreClassic)" d="M -5,-1.7 C -8,-2.1 -11,-1.7 -13,-1 C -14.5,-0.4 -15.5,0 -16,0 C -15.5,0 -14.5,0.4 -13,1 C -11,1.7 -8,2.1 -5,1.7 Z" />
                  </g>
                </g>
              ))}

              {/* Engine nacelles centered on the traced wingtip engine points */}
              <rect className={styles.metal} x="-11.08" y="-6.05" width="7" height="2.8" rx="1.3" ry="1.3" style={{ fill: 'url(#metalGrad)' }} />
              <rect className={styles.metal} x="-11.08" y="3.25" width="7" height="2.8" rx="1.3" ry="1.3" style={{ fill: 'url(#metalGrad)' }} />
              <ellipse className={[styles.nozzleRim, !resting && thrustActive ? styles.nozzleRimActive : ''].filter(Boolean).join(' ')} cx="-11.08" cy="-4.65" rx="0.3" ry="1.4" fill="#ffd9a0" />
              <ellipse className={[styles.nozzleRim, !resting && thrustActive ? styles.nozzleRimActive : ''].filter(Boolean).join(' ')} cx="-11.08" cy="4.65" rx="0.3" ry="1.4" fill="#ffd9a0" />

              {/* Hull traced from a real A-wing reference image: a long slim nose out to a wide
                  shoulder flare, the wing narrowing slightly again before the tail notch. */}
              <polygon className={styles.hull} points="14,0 0.58,-8.22 -9.69,-6.47 -8,0 -9.69,6.47 0.58,8.22" />

              {/* Texture: panel seams plus orange highlight stripes running flat along the thrust
                  axis, clipped to the hull so they never need their own hand-fitted silhouette. */}
              <g clipPath="url(#hullClip)">
                <line className={styles.hullPanelLine} x1="14" y1="0" x2="-8" y2="0" />
                <line className={styles.hullPanelLine} x1="2" y1="-8.6" x2="-9" y2="-6.9" />
                <line className={styles.hullPanelLine} x1="2" y1="8.6" x2="-9" y2="6.9" />
                <rect x="-30" y="-6.15" width="40" height="1.3" fill="#ff8c3a" opacity="0.92" />
                <rect x="-30" y="4.85" width="40" height="1.3" fill="#ff8c3a" opacity="0.92" />
                <rect x="-30" y="-5.35" width="40" height="0.35" fill="#ffd9a0" opacity="0.8" />
                <rect x="-30" y="5.65" width="40" height="0.35" fill="#ffd9a0" opacity="0.8" />
              </g>

              {/* Forward cannon barrels */}
              <rect className={styles.barrel} x="9" y="-2.15" width="5" height="0.3" />
              <rect className={styles.barrel} x="9" y="1.85" width="5" height="0.3" />

              {/* Canopy: faceted frame + glass with a windscreen divider and a shine highlight */}
              <polygon className={styles.accent} points="12,-1.1 8.6,0 12,1.1" />
              <polygon className={styles.canopyFrame} points="8.39,0 5.01,-2.75 -0.86,-2.38 -2.49,0 -0.86,2.38 5.01,2.75" />
              <polygon className={styles.canopyGlass} points="7.64,0 4.76,-1.88 0.01,-1.69 -1.36,0 0.01,1.69 4.76,1.88" />
              <line className={styles.canopyDivider} x1="6.08" y1="-1.69" x2="6.08" y2="1.69" />
              <ellipse className={styles.canopyShine} cx="2.70" cy="-0.93" rx="1.69" ry="0.54" transform="rotate(-18 2.70 -0.93)" />
            </>
          ) : (
            <>
              <ellipse className={styles.saucerShadow} cx="0" cy="2.4" rx="5.5" ry="1" />
              <ellipse className={styles.saucer} cx="0" cy="1.4" rx="6.5" ry="1.8" />
              <ellipse className={styles.dome} cx="0" cy="-1" rx="3.5" ry="3" />
              <ellipse className={styles.alienHead} cx="0" cy="-1.1" rx="1.6" ry="1.8" />
              <ellipse className={styles.alienEye} cx="-0.6" cy="-1.3" rx="0.4" ry="0.6" />
              <ellipse className={styles.alienEye} cx="0.6" cy="-1.3" rx="0.4" ry="0.6" />
              <circle className={styles.rimLightA} cx="-4.6" cy="1.5" r="0.5" />
              <circle className={styles.rimLightB} cx="0" cy="2.1" r="0.5" />
              <circle className={styles.rimLightC} cx="4.6" cy="1.5" r="0.5" />
            </>
          )}
        </g>
      </g>
    </g>
  )
}
