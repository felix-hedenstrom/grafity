import styles from './WalkerToken.module.css'

interface WalkerTokenProps {
  x: number
  y: number
  /** How long (ms) the glide to this x/y should take — the edge's actual travel time, so the token arrives exactly as the walker's logical hop completes. 0 while sitting still (discovering/waiting), which keeps it snapped in place rather than easing into its own position. */
  travelMs: number
  /** 'reverse' is the second walker in Bidirectional Search (starting from the exit); 'main' is walkers[0] — the one the camera follows and whose own arrival at the goal ends the run. Distinct colors keep all three readable as different roles rather than duplicates. */
  variant?: 'forward' | 'reverse' | 'main'
}

/** Positions are static (baked in by layoutGraph), so a plain cx/cy + CSS transition gives a smooth glide between nodes with no imperative DOM writes needed. Duration is set inline per-hop (travelMs) rather than fixed in CSS, so the glide actually spans the edge's real travel time instead of always animating over the same fixed duration regardless of distance/speed. */
export function WalkerToken({ x, y, travelMs, variant = 'forward' }: WalkerTokenProps) {
  return (
    <circle
      cx={x}
      cy={y}
      r={variant === 'main' ? 7 : 6}
      style={{ transitionDuration: `${travelMs}ms` }}
      className={[styles.walker, variant === 'reverse' ? styles.reverse : '', variant === 'main' ? styles.main : '']
        .filter(Boolean)
        .join(' ')}
    />
  )
}
