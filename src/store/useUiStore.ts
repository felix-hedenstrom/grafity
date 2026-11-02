import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  hasSeenIntro: boolean
  introOpen: boolean
  optionsOpen: boolean
  markIntroSeen: () => void
  openIntro: () => void
  closeIntro: () => void
  openOptions: () => void
  closeOptions: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      hasSeenIntro: false,
      introOpen: false,
      optionsOpen: false,

      markIntroSeen: () => set({ hasSeenIntro: true }),
      openIntro: () => set({ introOpen: true }),
      closeIntro: () => set({ introOpen: false }),
      openOptions: () => set({ optionsOpen: true }),
      closeOptions: () => set({ optionsOpen: false }),
    }),
    {
      name: 'grafity-ui-v1',
      // introOpen/optionsOpen are transient UI state, not progress — never persisted, so a reload never reopens a popup.
      partialize: (state) => ({ hasSeenIntro: state.hasSeenIntro }),
    },
  ),
)
