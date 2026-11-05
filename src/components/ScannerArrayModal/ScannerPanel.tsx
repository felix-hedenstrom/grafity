import { currentWireLength } from '../../game/scannerWiring/array'
import { computeClarity, computeScannerMultiplier, isScannerArrayUnlocked } from '../../game/scannerWiring/rules'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import { useUiStore } from '../../store/useUiStore'
import { ScannerBoard } from './ScannerBoard'
import styles from './ScannerPanel.module.css'

/** Always-visible Scanner Array strip under the graph: the live board plus its headline numbers; clicking anywhere opens the full modal. */
export function ScannerPanel() {
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const openScannerArray = useUiStore((s) => s.openScannerArray)
  const sensorCount = useScannerWiringStore((s) => s.sensors.length)
  const clarity = useScannerWiringStore((s) => computeClarity(s.referenceLength, currentWireLength(s)))
  const stumped = useScannerWiringStore((s) => s.pendingSwap === null)
  if (!isScannerArrayUnlocked(highestGraphNodeCount, sensorCount)) return null
  const multiplier = computeScannerMultiplier(sensorCount, clarity)

  return (
    <button type="button" className={styles.panel} onClick={openScannerArray} aria-label="Open the Scanner Array">
      <ScannerBoard compact className={styles.board} />
      <div className={styles.info}>
        <span className={styles.heading}>Scanner Array</span>
        <span className={styles.multiplier}>×{multiplier.toFixed(2)} Insight</span>
        <span className={styles.stats}>
          {sensorCount} sensor{sensorCount === 1 ? '' : 's'} · {(clarity * 100).toFixed(1)}% clarity
        </span>
        <span className={styles.status}>{stumped ? 'Darkly-bot is waiting for a new sensor.' : 'Darkly-bot is untangling the wiring…'}</span>
        <span className={styles.more}>Click for details</span>
      </div>
    </button>
  )
}
