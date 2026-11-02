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
export function WalkerToken({ x, y, travelMs, angle, nodeRadius, variant = 'forward' }: WalkerTokenProps) {
  const discovering = travelMs === 0
  const isMain = variant === 'main'

  return (
    <g
      className={styles.position}
      style={{ transform: `translate(${x}px, ${y}px)`, transitionDuration: `${travelMs}ms` }}
    >
      <g
        className={[styles.heading, variant === 'reverse' ? styles.reverse : '', discovering ? styles.discoveringOrbit : '']
          .filter(Boolean)
          .join(' ')}
        style={{ transform: `rotate(${angle}deg)`, '--orbit-r': `${(nodeRadius + ORBIT_MARGIN) * ORBIT_SCALE}px` } as CSSProperties}
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
