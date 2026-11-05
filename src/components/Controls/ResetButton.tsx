import { useEffect, useState } from 'react'
import { withSchedulerSuspended } from '../../game/loop/walkerScheduler'
import { useAchievementStore } from '../../store/useAchievementStore'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import styles from './ResetButton.module.css'

const ARM_TIMEOUT_MS = 3000

/** Two-click arm/confirm instead of a native confirm() — avoids a blocking browser dialog and reads more clearly inline. A true hard reset wipes Nebulas/Prestige Shop purchases too, not just the current cycle. */
export function ResetButton() {
  const [armed, setArmed] = useState(false)
  const resetProgress = useProgressionStore((s) => s.resetProgress)
  const resetAchievements = useAchievementStore((s) => s.resetAchievements)
  const resetPrestige = usePrestigeStore((s) => s.resetPrestige)

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
    // Suspended so the walker scheduler reconciles once against the final reset state, instead of
    // reacting mid-reset to a transient mix of new progression + old graph (or vice versa).
    withSchedulerSuspended(() => {
      resetProgress()
      resetPrestige()
      useRunStore.getState().resetWithNewGraph()
      resetAchievements()
    })
    setArmed(false)
  }

  return (
    <button type="button" className={armed ? styles.confirm : styles.reset} onClick={handleClick}>
      {armed ? 'Click again to confirm' : 'Hard reset progress'}
    </button>
  )
}
