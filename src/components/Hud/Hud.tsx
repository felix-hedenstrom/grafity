import { nebulasForGraphSize } from '../../game/currency/rules'
import { PRESTIGE_UNLOCK_LEVEL } from '../../game/prestige/rules'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useUiStore } from '../../store/useUiStore'
import styles from './Hud.module.css'

export function Hud() {
  const currency = useProgressionStore((s) => s.currency)
  const stepsTaken = useRunStore((s) => s.walkers.reduce((sum, w) => sum + w.stepsTaken, 0))
  const visitedCount = useRunStore((s) => s.discovery.visitedNodeIds.size)
  const discoveredCount = useRunStore((s) => s.discovery.discoveredNodeIds.size)
  const totalNodes = useRunStore((s) => s.graph.nodes.length)
  const openIntro = useUiStore((s) => s.openIntro)
  const openOptions = useUiStore((s) => s.openOptions)
  const openPrestigeShop = useUiStore((s) => s.openPrestigeShop)
  const prestigeUnlocked = usePrestigeStore((s) => s.lifetimeHighestGraphNodeCount >= PRESTIGE_UNLOCK_LEVEL)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const projectedNebulas = nebulasForGraphSize(highestGraphNodeCount)

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

      {prestigeUnlocked && (
        <div className={styles.prestigeBox}>
          <div className={styles.boxHeading}>Prestige</div>
          <button type="button" className={styles.prestigeButton} onClick={openPrestigeShop} aria-label="Open prestige shop">
            +{projectedNebulas} N
          </button>
        </div>
      )}

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
