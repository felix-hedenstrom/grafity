import { useRef } from 'react'
import { Modal } from '../Modal/Modal'
import { ResetButton } from '../Controls/ResetButton'
import { SaveTransferCard } from './SaveTransferCard'
import { useProgressionStore, STARTING_GRAPH_NODE_COUNT } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { useUiStore } from '../../store/useUiStore'
import styles from '../Shop/Shop.module.css'

export function OptionsModal() {
  const optionsOpen = useUiStore((s) => s.optionsOpen)
  const closeOptions = useUiStore((s) => s.closeOptions)

  const graphNodeCount = useProgressionStore((s) => s.graphNodeCount)
  const highestGraphNodeCount = useProgressionStore((s) => s.highestGraphNodeCount)
  const selectLevel = useProgressionStore((s) => s.selectLevel)
  const themeMode = useProgressionStore((s) => s.themeMode)
  const toggleTheme = useProgressionStore((s) => s.toggleTheme)
  const resetWithNewGraph = useRunStore((s) => s.resetWithNewGraph)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!optionsOpen) return null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = Number(inputRef.current?.value)
    if (!Number.isInteger(parsed)) return
    selectLevel(parsed)
    resetWithNewGraph()
  }

  return (
    <Modal title="Options" onClose={closeOptions}>
      <div className={styles.shop}>
        <div className={styles.card}>
          <div className={styles.name}>Level {graphNodeCount}</div>
          <div className={styles.description}>
            The graph's node count is the level. Max reached: {highestGraphNodeCount}. Enter any level from{' '}
            {STARTING_GRAPH_NODE_COUNT} up to {highestGraphNodeCount} to jump there.
          </div>
          {/* Uncontrolled + keyed on graphNodeCount: remounts (and so re-syncs its displayed value) only when the level actually changes elsewhere, without an effect-driven setState. */}
          <form key={graphNodeCount} className={styles.buttonRow} onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="number"
              className={styles.levelInput}
              min={STARTING_GRAPH_NODE_COUNT}
              max={highestGraphNodeCount}
              defaultValue={graphNodeCount}
            />
            <button type="submit" className={styles.buyButton}>
              Go
            </button>
          </form>
        </div>
        <div className={styles.card}>
          <div className={styles.name}>Display</div>
          <div className={styles.description}>{themeMode === 'dark' ? 'Dark mode is on.' : 'Light mode is on.'}</div>
          <button type="button" className={styles.buyButton} onClick={toggleTheme}>
            {themeMode === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
          </button>
        </div>
        <div className={styles.card}>
          <div className={styles.name}>Reset level</div>
          <div className={styles.description}>Restarts the current level with a fresh graph. Currency and upgrades are untouched.</div>
          <button type="button" className={styles.buyButton} onClick={() => resetWithNewGraph()}>
            Reset level
          </button>
        </div>
        <SaveTransferCard />
        <div className={styles.card}>
          <div className={styles.name}>Hard reset progress</div>
          <div className={styles.description}>Wipes currency, upgrades, achievements, and the level back to the very start.</div>
          <ResetButton />
        </div>
      </div>
    </Modal>
  )
}
