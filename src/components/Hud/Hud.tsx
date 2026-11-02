import { DISCOVERY_REWARD_PER_NODE, GOAL_REWARD_PER_NODE, REVISIT_REWARD } from '../../game/currency/rules'
import {
  computeEdgesPerSecond,
  computeMomentumMultiplier,
  computeTickIntervalMs,
  QUICK_STEPS_SPEED_PER_LEVEL,
} from '../../game/speed/rules'
import { useNow } from '../../hooks/useNow'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import styles from './Hud.module.css'

export function Hud() {
  const currency = useProgressionStore((s) => s.currency)
  const quickStepsLevel = useProgressionStore((s) => s.quickStepsLevel)
  const momentumLevel = useProgressionStore((s) => s.momentumLevel)
  const stepsTaken = useRunStore((s) => s.walkers.reduce((sum, w) => sum + w.stepsTaken, 0))
  const runStartedAt = useRunStore((s) => s.runStartedAt)
  const discoveredCount = useRunStore((s) => s.discovery.discoveredNodeIds.size)
  const totalNodes = useRunStore((s) => s.graph.nodes.length)

  // Momentum's display needs to tick forward with real time even between game ticks.
  const now = useNow()

  const elapsedSecondsThisRun = (now - runStartedAt) / 1000
  const edgesPerSecond = computeEdgesPerSecond(
    computeTickIntervalMs({ quickStepsLevel, momentumLevel, elapsedSecondsThisRun }),
  )
  const exitReward = totalNodes * GOAL_REWARD_PER_NODE

  const quickStepsBonus = quickStepsLevel * QUICK_STEPS_SPEED_PER_LEVEL
  const momentumPercent = Math.round((computeMomentumMultiplier(momentumLevel, elapsedSecondsThisRun) - 1) * 100)

  return (
    <div className={styles.hud}>
      <div className={styles.stat}>
        <span className={styles.label}>Steps</span>
        <span className={styles.value}>{stepsTaken}</span>
      </div>
      <div className={styles.stat}>
        <span className={styles.label}>Discovered</span>
        <span className={styles.value}>
          {discoveredCount} / {totalNodes}
        </span>
      </div>

      <div className={styles.box}>
        <div className={styles.boxHeading}>Insight</div>
        <div className={styles.boxValue}>{currency.amount}</div>
        <div className={styles.boxBreakdown}>
          <div>
            +{DISCOVERY_REWARD_PER_NODE} / discovery, +{REVISIT_REWARD} / revisit
          </div>
          <div>
            +{exitReward} / exit ({GOAL_REWARD_PER_NODE} × {totalNodes} nodes)
          </div>
        </div>
      </div>

      <div className={styles.box}>
        <div className={styles.boxHeading}>Speed</div>
        <div className={styles.boxValue}>{edgesPerSecond.toFixed(2)} edges/sec</div>
        <div className={styles.boxBreakdown}>
          {quickStepsLevel > 0 && <div>{`Quick Steps: +${quickStepsBonus.toFixed(1)} edges/sec`}</div>}
          {momentumLevel > 0 && <div>{`Momentum: +${momentumPercent}%`}</div>}
        </div>
      </div>
    </div>
  )
}
