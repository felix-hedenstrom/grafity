import { computeDistancePerSecond, computeMomentumMultiplier, QUICK_STEPS_PERCENT_PER_LEVEL } from '../../game/speed/rules'
import { useNow } from '../../hooks/useNow'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useUiStore } from '../../store/useUiStore'
import styles from './Hud.module.css'

export function Hud() {
  const currency = useProgressionStore((s) => s.currency)
  const quickStepsLevel = useProgressionStore((s) => s.quickStepsLevel)
  const momentumLevel = useProgressionStore((s) => s.momentumLevel)
  const stepsTaken = useRunStore((s) => s.walkers.reduce((sum, w) => sum + w.stepsTaken, 0))
  const runStartedAt = useRunStore((s) => s.runStartedAt)
  const visitedCount = useRunStore((s) => s.discovery.visitedNodeIds.size)
  const discoveredCount = useRunStore((s) => s.discovery.discoveredNodeIds.size)
  const totalNodes = useRunStore((s) => s.graph.nodes.length)
  const openIntro = useUiStore((s) => s.openIntro)
  const openOptions = useUiStore((s) => s.openOptions)

  // Momentum's display needs to tick forward with real time even between game ticks.
  const now = useNow()

  const elapsedSecondsThisRun = (now - runStartedAt) / 1000
  const distancePerSecond = computeDistancePerSecond({ quickStepsLevel, momentumLevel, elapsedSecondsThisRun })
  const quickStepsPercent = Math.round(((1 + QUICK_STEPS_PERCENT_PER_LEVEL) ** quickStepsLevel - 1) * 100)
  const momentumPercent = Math.round((computeMomentumMultiplier(momentumLevel, elapsedSecondsThisRun) - 1) * 100)

  return (
    <div className={styles.hud}>
      <div className={styles.stat}>
        <span className={styles.label}>Steps</span>
        <span className={styles.value}>{stepsTaken}</span>
      </div>
      <div className={styles.box}>
        <div className={styles.counts}>
          <span className={styles.label}>Visited</span>
          <span className={styles.value}>{visitedCount}</span>
          <span className={styles.label}>Discovered</span>
          <span className={styles.value}>{discoveredCount}</span>
          <span className={styles.label}>Total</span>
          <span className={styles.value}>{totalNodes}</span>
        </div>
      </div>

      <div className={styles.box}>
        <div className={styles.boxHeading}>Insight</div>
        <div className={styles.boxValue}>{currency.amount}</div>
      </div>

      <div className={styles.box}>
        <div className={styles.boxHeading}>Speed</div>
        <div className={styles.boxValue}>{distancePerSecond.toFixed(1)} distance/sec</div>
        <div className={styles.boxBreakdown}>
          {quickStepsLevel > 0 && <div>{`Quick Steps: +${quickStepsPercent}%`}</div>}
          {momentumLevel > 0 && <div>{`Momentum: +${momentumPercent}%`}</div>}
        </div>
      </div>

      <div className={styles.iconRow}>
        <button type="button" className={styles.iconButton} onClick={openIntro} aria-label="Show introduction">
          ?
        </button>
        <button type="button" className={styles.iconButton} onClick={openOptions} aria-label="Open options">
          ⚙
        </button>
      </div>
    </div>
  )
}
