import { useEffect } from 'react'
import { ACHIEVEMENTS } from '../../game/achievements/definitions'
import { useAchievementStore } from '../../store/useAchievementStore'
import styles from './AchievementToast.module.css'

const DISPLAY_MS = 4000

/** Shows the oldest queued unlock, then auto-dismisses it after DISPLAY_MS — the queue (not a single slot) means a multi-unlock moment plays them one at a time instead of clobbering each other. */
export function AchievementToast() {
  const currentId = useAchievementStore((s) => s.toastQueue[0])
  const dismissCurrentToast = useAchievementStore((s) => s.dismissCurrentToast)

  useEffect(() => {
    if (!currentId) return
    const id = setTimeout(dismissCurrentToast, DISPLAY_MS)
    return () => clearTimeout(id)
  }, [currentId, dismissCurrentToast])

  if (!currentId) return null
  const achievement = ACHIEVEMENTS.find((a) => a.id === currentId)
  if (!achievement) return null

  return (
    <div className={styles.toast} role="status">
      <div className={styles.label}>Achievement Unlocked</div>
      <div className={styles.name}>🏆 {achievement.name}</div>
      <div className={styles.description}>{achievement.description}</div>
    </div>
  )
}
