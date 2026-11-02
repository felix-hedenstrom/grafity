import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import styles from './WalkerToken.module.css'

interface WalkerTokenProps {
  x: number
  y: number
  /** How long (ms) the glide to this x/y should take — the edge's actual travel time, so the token arrives exactly as the walker's logical hop completes. 0 while sitting still (discovering/waiting), which keeps it snapped in place and triggers the discovering orbit instead of a glide. */
  travelMs: number
  /** Heading in degrees: the edge currently being crossed while traveling, or the last edge arrived on while sitting still. Points the ship's nose and anchors the discovering orbit's exit heading. */
  angle: number
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
 * the star's halo rather than clipping through it. */
const ORBIT_MARGIN = 5

/** The orbit circle itself is scaled down from the node-clearing radius above — a full
 * node-sized loop read as oversized next to the ship, so only half of it is actually used. */
const ORBIT_SCALE = 0.5

/** Positions are static (baked in by layoutGraph), so a translate() + CSS transition on the outer
 * group gives a smooth glide between nodes with no imperative DOM writes needed — the same trick
 * the old plain-circle version used on cx/cy, just promoted to a transform so a shape (not just a
 * dot) can ride along it. A nested inner group carries the heading rotation and the discovering
 * animation, kept separate so they don't have to fight the position transition for the same
 * property on the same element. Every ship class shares the same discovering gesture — a real
 * orbit around the node — so "investigating" reads as one consistent language across the main
 * ship and every UFO sub-ship, not a different motion per shape. */
export function WalkerToken({ x, y, travelMs, angle, nodeRadius, variant = 'forward', scale = 1 }: WalkerTokenProps) {
  const discovering = travelMs === 0
  const isMain = variant === 'main'

  const headingRef = useRef<SVGGElement>(null)
  const wasDiscoveringRef = useRef(discovering)
  const unwrappedAngleRef = useRef(angle)
  const [displayAngle, setDisplayAngle] = useState(angle)
  // Inline transform override that freezes .heading at its last live orbit frame for exactly
  // one paint when discovering ends, so the CSS transition has a real "before" value to animate
  // from. Without this, React removes .discoveringOrbit and sets the final rotate(angle) in the
  // same commit — since the class and the target both change together, the browser's transition
  // starts from the underlying (non-animated) inline style, not from wherever the spin actually
  // was, producing a snap instead of a smooth hand-off.
  const [frozenTransform, setFrozenTransform] = useState<string | null>(null)
  // getComputedStyle at the moment discovering flips off already reflects the post-commit style
  // (useLayoutEffect runs after DOM mutation), so the live orbit position has to be captured
  // continuously, one frame ahead of time, while the orbit animation is still running.
  const liveOrbitTransformRef = useRef<string | null>(null)

  useEffect(() => {
    if (!discovering) return
    let raf: number
    const capture = () => {
      const el = headingRef.current
      if (el) liveOrbitTransformRef.current = getComputedStyle(el).transform
      raf = requestAnimationFrame(capture)
    }
    raf = requestAnimationFrame(capture)
    return () => cancelAnimationFrame(raf)
  }, [discovering])

  // The discovering orbit spins .heading through its own raw keyframe angles (90deg..450deg,
  // looping), completely independent of `angle`. If discovering just ended, a naive transition
  // would interpolate straight from wherever that spin happened to be to the raw target angle —
  // often the long way around (up to ~350deg of unwind) since the two numbers share no
  // relationship. Using the last captured live rotation and re-expressing the target as the
  // nearest equivalent (mod 360) makes the hand-off always take the short way.
  useLayoutEffect(() => {
    const wasDiscovering = wasDiscoveringRef.current
    wasDiscoveringRef.current = discovering

    if (wasDiscovering && !discovering) {
      const snapshot = liveOrbitTransformRef.current
      let base = unwrappedAngleRef.current
      if (snapshot && snapshot !== 'none') {
        const m = new DOMMatrixReadOnly(snapshot)
        base = (Math.atan2(m.b, m.a) * 180) / Math.PI
      }
      // Freeze rotation only, not the raw orbit snapshot: the orbit keyframes translate the
      // ship out to orbit-r as well as rotating it, so the raw snapshot carries that circular
      // offset. Transitioning from the *raw* snapshot down to rotate(angle) (zero translate)
      // would drag that offset through the 220ms hand-off while the outer .position group is
      // already gliding straight toward the next node — the ship visibly swings in from its
      // orbit position instead of riding the edge line, worst on sharp turns where the orbit's
      // (essentially arbitrary) frozen offset points nowhere near the new edge's direction. A
      // pure rotate(base) keeps the same continuity for the angle (no rotational snap, which is
      // what this freeze exists for) while landing the ship exactly on the node immediately.
      setFrozenTransform(`rotate(${base}deg)`)
      const delta = ((angle - base + 540) % 360) - 180
      const next = base + delta
      unwrappedAngleRef.current = next
      setDisplayAngle(next)
      return
    }

    const base = unwrappedAngleRef.current
    const delta = ((angle - base + 540) % 360) - 180
    const next = base + delta
    unwrappedAngleRef.current = next
    setDisplayAngle(next)
  }, [angle, discovering])

  // Releasing the freeze has to happen in a *separate, later* commit than setting it — doing
  // both from the same useLayoutEffect (even via requestAnimationFrame) risks React flushing
  // the follow-up update via microtask before the browser ever paints the frozen frame, which
  // collapses the two steps into one and brings back the wrong-base snap. useEffect is
  // guaranteed to run only after the browser has painted, so scheduling the release here — one
  // effect-cycle after the freeze was committed — guarantees the frozen frame actually painted
  // first, giving the transition a real value to animate away from.
  useEffect(() => {
    if (frozenTransform === null) return
    const raf = requestAnimationFrame(() => setFrozenTransform(null))
    return () => cancelAnimationFrame(raf)
  }, [frozenTransform])

  return (
    <g
      className={styles.position}
      style={{ transform: `translate(${x}px, ${y}px)`, transitionDuration: `${travelMs}ms` }}
    >
      <g
        ref={headingRef}
        className={[styles.heading, variant === 'reverse' ? styles.reverse : '', discovering ? styles.discoveringOrbit : '']
          .filter(Boolean)
          .join(' ')}
        style={
          {
            transform: `${frozenTransform ?? `rotate(${displayAngle}deg)`} scale(${scale})`,
            // The freeze-frame itself must apply with no transition — it's only there to give
            // the *next* commit a real "before" value, so it has to land instantly, exactly
            // matching the orbit's last live frame, with zero visible motion of its own.
            transitionDuration: frozenTransform ? '0ms' : undefined,
            '--orbit-r': `${(nodeRadius + ORBIT_MARGIN) * ORBIT_SCALE * scale}px`,
          } as CSSProperties
        }
      >
        {isMain ? (
          <>
            <ellipse className={styles.hullHalo} cx="-2" cy="0" rx="7" ry="4" />
            {/* Always mounted (never conditionally rendered) so the group's bounding box —
                and thus the fill-box rotation pivot above — never shifts between states;
                only opacity toggles between discovering and traveling. */}
            <polygon className={[styles.exhaustOuter, discovering ? styles.exhaustHidden : ''].filter(Boolean).join(' ')} points="-5,-2.5 -5,2.5 -16,0" />
            <polygon className={[styles.exhaustCore, discovering ? styles.exhaustHidden : ''].filter(Boolean).join(' ')} points="-5,-1 -5,1 -11,0" />
            <polygon className={styles.hull} points="8,0 -5,-4 -2,0 -5,4" />
            <circle className={styles.cockpitOuter} cx="2" cy="0" r="1.3" />
            <circle className={styles.cockpitInner} cx="2" cy="0" r="0.8" />
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
  )
}
