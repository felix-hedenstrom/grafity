import { useEffect, useState } from 'react'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import styles from './ResetButton.module.css'

const ARM_TIMEOUT_MS = 3000

/** Two-click arm/confirm instead of a native confirm() — avoids a blocking browser dialog and reads more clearly inline. */
export function ResetButton() {
  const [armed, setArmed] = useState(false)
  const resetProgress = useProgressionStore((s) => s.resetProgress)

  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [armed])

  function handleClick() {
    if (!armed) {
      setArmed(true)
      return
    }
    resetProgress()
    useRunStore.getState().resetWithNewGraph()
    setArmed(false)
  }

  return (
    <button type="button" className={armed ? styles.confirm : styles.reset} onClick={handleClick}>
      {armed ? 'Click again to confirm' : 'Reset progress'}
    </button>
  )
}
