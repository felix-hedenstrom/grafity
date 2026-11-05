import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  hasSeenIntro: boolean
  introOpen: boolean
  optionsOpen: boolean
  prestigeShopOpen: boolean
  scannerArrayOpen: boolean
  markIntroSeen: () => void
  openIntro: () => void
  closeIntro: () => void
  openOptions: () => void
  closeOptions: () => void
  openPrestigeShop: () => void
  closePrestigeShop: () => void
  openScannerArray: () => void
  closeScannerArray: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      hasSeenIntro: false,
      introOpen: false,
      optionsOpen: false,
      prestigeShopOpen: false,
      scannerArrayOpen: false,

      markIntroSeen: () => set({ hasSeenIntro: true }),
      openIntro: () => set({ introOpen: true }),
      closeIntro: () => set({ introOpen: false }),
      openOptions: () => set({ optionsOpen: true }),
      closeOptions: () => set({ optionsOpen: false }),
      openPrestigeShop: () => set({ prestigeShopOpen: true }),
      closePrestigeShop: () => set({ prestigeShopOpen: false }),
      openScannerArray: () => set({ scannerArrayOpen: true }),
      closeScannerArray: () => set({ scannerArrayOpen: false }),
    }),
    {
      name: 'grafity-ui-v1',
      // introOpen/optionsOpen/prestigeShopOpen/scannerArrayOpen are transient UI state, not progress — never persisted, so a reload never reopens a popup.
      partialize: (state) => ({ hasSeenIntro: state.hasSeenIntro }),
    },
  ),
)
