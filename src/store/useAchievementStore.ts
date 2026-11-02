import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AchievementState {
  unlockedIds: string[]
  /** Ids waiting to be shown as a toast, oldest first — queued rather than overwritten so a multi-unlock moment (e.g. jumping several levels at once) doesn't silently drop any. */
  toastQueue: string[]
  /** Unlocks every id in `ids` not already unlocked, queuing a toast for each. */
  unlockMany: (ids: string[]) => void
  dismissCurrentToast: () => void
  /** Wipes every unlocked achievement — called by Reset Progress, so achievements track the current save, not a lifetime record. */
  resetAchievements: () => void
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set, get) => ({
      unlockedIds: [],
      toastQueue: [],

      unlockMany: (ids) => {
        const state = get()
        const newIds = ids.filter((id) => !state.unlockedIds.includes(id))
        if (newIds.length === 0) return
        set({
          unlockedIds: [...state.unlockedIds, ...newIds],
          toastQueue: [...state.toastQueue, ...newIds],
        })
      },

      dismissCurrentToast: () => set((state) => ({ toastQueue: state.toastQueue.slice(1) })),

      resetAchievements: () => set({ unlockedIds: [], toastQueue: [] }),
    }),
    {
      name: 'grafity-achievements-v1',
      // toastQueue is transient UI state, not progress — never persisted, so a reload never replays old toasts.
      partialize: (state) => ({ unlockedIds: state.unlockedIds }),
    },
  ),
)
