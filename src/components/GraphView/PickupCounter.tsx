import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import styles from './PickupCounter.module.css'

export type PickupKind = 'key' | 'pulsar'

const KIND: Record<PickupKind, { label: string; color: string; completeNote: string; icon: ReactNode }> = {
  key: {
    label: 'Keys',
    // Same gold as the key stars on the map (GraphView.module.css .key).
    color: '#ffd84a',
    completeNote: 'exit unlocked',
    icon: (
      <>
        <circle cx="5" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8h7M12.5 8v3M15 8v2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  pulsar: {
    label: 'Pulsars',
    // The Scanner Array green the pulsar beams use on the map.
    color: 'var(--wire)',
    completeNote: 'all collected',
    icon: (
      <>
        <polygon points="0.5,8 8,6.9 15.5,8 8,9.1" fill="currentColor" transform="rotate(-35 8 8)" />
        <circle cx="8" cy="8" r="3" fill="currentColor" opacity="0.35" />
        <circle cx="8" cy="8" r="1.7" fill="#e6f6ff" />
      </>
    ),
  },
}

interface PickupCounterProps {
  kind: PickupKind
  /** Pickups of this kind some walker has visited this level. */
  collected: number
  /** Pickups of this kind the level started with; 0 hides the counter. */
  total: number
}

/** Map-corner `collected/total` chip for one pickup kind. Pulses on each new pickup and turns accent-colored once all are collected. */
export function PickupCounter({ kind, collected, total }: PickupCounterProps) {
  // Derived-state-from-props, like ScaleBar: bump a pulse id whenever collected goes up.
  const [prevCollected, setPrevCollected] = useState(collected)
  const [pulseId, setPulseId] = useState(0)
  if (collected !== prevCollected) {
    setPrevCollected(collected)
    if (collected > prevCollected) setPulseId(pulseId + 1)
  }

  if (total <= 0) return null
  const { label, color, completeNote, icon } = KIND[kind]
  const complete = collected >= total
  return (
    <div
      // Remounting restarts the pulse animation.
      key={pulseId}
      className={`${styles.counter} ${complete ? styles.complete : ''} ${pulseId > 0 ? styles.pulse : ''}`}
      style={{ '--pickup-color': color } as CSSProperties}
      role="status"
      aria-label={complete ? `${label}: all ${total} collected, ${completeNote}` : `${label}: ${collected} of ${total}`}
    >
      <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true">
        {icon}
      </svg>
      <span>
        {collected}/{total}
      </span>
    </div>
  )
}

/** The bottom-left column the counters stack in, just above the scale bar. */
export function PickupCounterStack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>
}
