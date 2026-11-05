import { currentWireLength } from '../../game/scannerWiring/array'
import { computeClarity, computeDarklyBotStepMs, computeScannerMultiplier } from '../../game/scannerWiring/rules'
import { PRODUCTION_CONFIG } from '../../game/config/production'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import { useUiStore } from '../../store/useUiStore'
import { Modal } from '../Modal/Modal'
import { ScannerBoard } from './ScannerBoard'
import styles from './ScannerArrayModal.module.css'

function formatWire(length: number): string {
  return `${length.toFixed(3)} m`
}

export function ScannerArrayModal() {
  const open = useUiStore((s) => s.scannerArrayOpen)
  const close = useUiStore((s) => s.closeScannerArray)
  if (!open) return null
  return (
    <Modal title="Scanner Array" onClose={close} className={styles.panel}>
      <ScannerArrayBody />
    </Modal>
  )
}

/** Watch-only: Darkly-bot untangles the loop on its own, and neutron stars out in the levels keep adding sensors to it. */
function ScannerArrayBody() {
  const sensors = useScannerWiringStore((s) => s.sensors)
  const order = useScannerWiringStore((s) => s.order)
  const referenceOrder = useScannerWiringStore((s) => s.referenceOrder)
  const referenceLength = useScannerWiringStore((s) => s.referenceLength)
  const stumped = useScannerWiringStore((s) => s.pendingSwap === null)
  const servosLevel = useProgressionStore((s) => s.darklyBotServosLevel)

  const length = currentWireLength({ sensors, order, referenceOrder, referenceLength })
  const clarity = computeClarity(referenceLength, length)
  const multiplier = computeScannerMultiplier(sensors.length, clarity)
  const { bonusPerSensor, neutronStarsPerLevel } = PRODUCTION_CONFIG.scannerWiring

  return (
    <div className={styles.body}>
      <p className={styles.flavor}>
        One closed loop of wire runs through every sensor. Shorter wire, cleaner signal — and more Insight into our beautiful universe. Each level hides{' '}
        {neutronStarsPerLevel} neutron stars; the first ship to reach one wires a new sensor into the array.
      </p>

      <div className={styles.boardWrap}>
        <ScannerBoard />
      </div>

      <div className={styles.stats}>
        <span>Sensors</span>
        <span>{sensors.length}</span>
        <span>Wire length</span>
        <span>{formatWire(length)}</span>
        <span>Reference loop</span>
        <span>{formatWire(referenceLength)}</span>
        <span>Signal clarity</span>
        <span>{`${(clarity * 100).toFixed(1)}%`}</span>
        <span className={styles.total}>Insight boost</span>
        <span className={styles.total}>×{multiplier.toFixed(2)}</span>
      </div>

      <p className={styles.hint}>
        Every sensor adds up to ×{bonusPerSensor.toFixed(2)}, scaled steeply by clarity — the dashed loop is the reference a clean wiring is measured
        against.
      </p>
      <p className={styles.darklyBot}>
        {stumped
          ? 'Darkly-bot is scratching its head — nothing left it can untangle. A new sensor will give it work.'
          : `Darkly-bot is crawling through the array, untangling a wire every ${(computeDarklyBotStepMs(servosLevel) / 1000).toFixed(1)}s.`}
      </p>
    </div>
  )
}
