import { useState } from 'react'
import { fixedScaleBar, scaleChangePercent } from '../../game/graph/scaleBar'
import styles from './ScaleBar.module.css'

interface ScaleBarProps {
  /** World units per on-screen pixel of the live camera — so manual zoom moves the bar too. */
  worldPerPixel: number
  /** The current graph's node spacing (minEdgeLength) — a change between graphs triggers the ↑/↓ badge. */
  spacing: number
}

/** Below this, a spacing change is noise (e.g. a same-size regenerated graph) — no badge. */
const MIN_BADGE_PERCENT = 0.5

/**
 * Fixed-length scale bar in light-time. The camera hides spacing growth on purpose (viewScale keeps
 * every level looking the same), so this is the player's one read on how far apart stars are
 * getting: the ruler never changes length, its two-decimal label climbs ls → lmin → lh → …, and
 * each new graph flashes its % change.
 */
export function ScaleBar({ worldPerPixel, spacing }: ScaleBarProps) {
  // Derived-state-from-props pattern: compare against the previous graph's spacing during render.
  // The first render (fresh mount / save load) has nothing to compare against, so no badge.
  const [prevSpacing, setPrevSpacing] = useState(spacing)
  const [change, setChange] = useState<{ percent: number; id: number } | null>(null)
  if (spacing !== prevSpacing) {
    const percent = scaleChangePercent(prevSpacing, spacing)
    setPrevSpacing(spacing)
    if (Math.abs(percent) >= MIN_BADGE_PERCENT) setChange({ percent, id: (change?.id ?? 0) + 1 })
  }

  const bar = fixedScaleBar(worldPerPixel)
  if (!bar) return null

  const up = change !== null && change.percent > 0
  return (
    <div
      // Remounting on each change restarts the pulse and badge-fade CSS animations.
      key={change?.id ?? 0}
      className={`${styles.scaleBar} ${change ? styles.pulse : ''}`}
      role="img"
      aria-label={`Map scale: ${bar.label}`}
    >
      <div className={styles.ruler} style={{ width: `${bar.pixelLength}px` }} />
      <div className={styles.labelRow}>
        <span>{bar.label}</span>
        {change && (
          <span className={`${styles.badge} ${up ? styles.badgeUp : styles.badgeDown}`}>
            {up ? '↑' : '↓'}
            {Math.round(Math.abs(change.percent))}%
          </span>
        )}
      </div>
    </div>
  )
}
