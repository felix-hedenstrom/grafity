import styles from './WalkerToken.module.css'

interface WalkerTokenProps {
  x: number
  y: number
  /** 'reverse' is the second walker in Bidirectional Search (starting from the exit) — a distinct color makes it read as a second searcher, not a duplicate. */
  variant?: 'forward' | 'reverse'
}

/** Positions are static (baked in by layoutGraph), so a plain cx/cy + CSS transition gives a smooth glide between nodes with no imperative DOM writes needed. */
export function WalkerToken({ x, y, variant = 'forward' }: WalkerTokenProps) {
  return <circle cx={x} cy={y} r={6} className={[styles.walker, variant === 'reverse' ? styles.reverse : ''].filter(Boolean).join(' ')} />
}
