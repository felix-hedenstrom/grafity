import styles from './CompassOverlay.module.css'

interface CompassOverlayProps {
  /** Bearing from the Spaceship to the exit, in degrees, world coordinates (0° = +x/east, y-down screen convention — valid on screen at any zoom/pan since the camera never rotates). */
  angleDeg: number
}

/** The ship's exit compass — shown only for strategies that genuinely know where the exit is (A*, Compass) once it has actually been discovered, so it never leaks fog-of-war information. */
export function CompassOverlay({ angleDeg }: CompassOverlayProps) {
  return (
    <div className={styles.compass} role="img" aria-label="Compass pointing toward the exit">
      <svg viewBox="-24 -24 48 48" width="48" height="48">
        <circle r="21" className={styles.dial} />
        <g className={styles.needleGroup} style={{ transform: `rotate(${angleDeg}deg)` }}>
          <path d="M 16 0 L -7 -5.5 L -3 0 L -7 5.5 Z" className={styles.needle} />
        </g>
        <circle r="2" className={styles.pivot} />
      </svg>
    </div>
  )
}
