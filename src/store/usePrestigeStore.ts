import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createCurrency, earn, spend } from '../game/currency/rules'
import type { CurrencyState } from '../game/currency/types'
import { NEBULA_UPGRADES } from '../game/prestige/rules'
import { PRODUCTION_CONFIG } from '../game/config/production'
import { costForLevel } from '../game/upgrades/scaling'

interface PrestigeState {
  nebulas: CurrencyState
  prestigeCount: number
  /** The highest graphNodeCount ever reached across every cycle, lifetime — unlike useProgressionStore's highestGraphNodeCount, this never resets on prestige, so achievements and these unlocks' minLevel gates stay permanently reachable. */
  lifetimeHighestGraphNodeCount: number
  minimapOwned: boolean
  minimapEnabled: boolean
  unlockUfoOwned: boolean
  mutexOwned: boolean
  mutexEnabled: boolean
  bidirectionalOwned: boolean
  /** Reverse Beacon can be toggled off (all UFOs forward again) without refunding it — the split takes effect on the next warp, never mid-run. */
  bidirectionalEnabled: boolean
  nebulaInsightLevel: number
  ftlLevel: number
  /** Called by useProgressionStore.prestige() with the run's final highestGraphNodeCount — pays out Nebulas, bumps the prestige count, and advances the lifetime high score. */
  recordPrestige: (nebulasEarned: number, highestGraphNodeCountThisRun: number) => void
  /** Called by useProgressionStore.growGraph() on every solve, so the lifetime high score (and anything gated on it, like achievements) advances live during a run, not just at prestige time. */
  bumpLifetimeHighest: (graphNodeCount: number) => void
  purchaseMinimap: () => boolean
  toggleMinimap: () => void
  purchaseUnlockUfo: () => boolean
  purchaseMutex: () => boolean
  toggleMutex: () => void
  purchaseBidirectional: () => boolean
  toggleBidirectional: () => void
  purchaseNebulaInsightLevel: () => boolean
  purchaseFtlLevel: () => boolean
  resetPrestige: () => void
}

const initialState = {
  nebulas: createCurrency(),
  prestigeCount: 0,
  lifetimeHighestGraphNodeCount: PRODUCTION_CONFIG.progression.startingGraphNodeCount,
  minimapOwned: false,
  minimapEnabled: true,
  unlockUfoOwned: false,
  mutexOwned: false,
  mutexEnabled: false,
  bidirectionalOwned: false,
  bidirectionalEnabled: false,
  nebulaInsightLevel: 0,
  ftlLevel: 0,
}

export const usePrestigeStore = create<PrestigeState>()(
  persist(
    (set, get) => ({
      ...initialState,

      recordPrestige: (nebulasEarned, highestGraphNodeCountThisRun) =>
        set((state) => ({
          nebulas: earn(state.nebulas, nebulasEarned),
          prestigeCount: state.prestigeCount + 1,
          lifetimeHighestGraphNodeCount: Math.max(state.lifetimeHighestGraphNodeCount, highestGraphNodeCountThisRun),
        })),

      bumpLifetimeHighest: (graphNodeCount) =>
        set((state) => ({ lifetimeHighestGraphNodeCount: Math.max(state.lifetimeHighestGraphNodeCount, graphNodeCount) })),

      purchaseMinimap: () => {
        const state = get()
        if (state.minimapOwned) return false
        if (state.nebulas.amount < NEBULA_UPGRADES.minimap.cost || state.lifetimeHighestGraphNodeCount < NEBULA_UPGRADES.minimap.minLevel) return false
        set({ nebulas: spend(state.nebulas, NEBULA_UPGRADES.minimap.cost), minimapOwned: true })
        return true
      },

      toggleMinimap: () => set((state) => ({ minimapEnabled: !state.minimapEnabled })),

      purchaseUnlockUfo: () => {
        const state = get()
        if (state.unlockUfoOwned) return false
        if (state.nebulas.amount < NEBULA_UPGRADES.unlockUfo.cost || state.lifetimeHighestGraphNodeCount < NEBULA_UPGRADES.unlockUfo.minLevel)
          return false
        set({ nebulas: spend(state.nebulas, NEBULA_UPGRADES.unlockUfo.cost), unlockUfoOwned: true })
        return true
      },

      purchaseMutex: () => {
        const state = get()
        if (state.mutexOwned) return false
        if (state.nebulas.amount < NEBULA_UPGRADES.mutex.cost || state.lifetimeHighestGraphNodeCount < NEBULA_UPGRADES.mutex.minLevel) return false
        set({ nebulas: spend(state.nebulas, NEBULA_UPGRADES.mutex.cost), mutexOwned: true })
        return true
      },

      toggleMutex: () => set((state) => ({ mutexEnabled: !state.mutexEnabled })),

      purchaseBidirectional: () => {
        const state = get()
        if (state.bidirectionalOwned) return false
        // Reverse Beacon re-bases UFOs — without Unlock UFO there's nothing to re-base.
        if (!state.unlockUfoOwned) return false
        if (
          state.nebulas.amount < NEBULA_UPGRADES.bidirectional.cost ||
          state.lifetimeHighestGraphNodeCount < NEBULA_UPGRADES.bidirectional.minLevel
        )
          return false
        set({ nebulas: spend(state.nebulas, NEBULA_UPGRADES.bidirectional.cost), bidirectionalOwned: true, bidirectionalEnabled: true })
        return true
      },

      toggleBidirectional: () => set((state) => ({ bidirectionalEnabled: !state.bidirectionalEnabled })),

      purchaseNebulaInsightLevel: () => {
        const state = get()
        const cost = costForLevel(NEBULA_UPGRADES.nebulaInsight, state.nebulaInsightLevel)
        if (state.nebulas.amount < cost) return false
        set({ nebulas: spend(state.nebulas, cost), nebulaInsightLevel: state.nebulaInsightLevel + 1 })
        return true
      },

      purchaseFtlLevel: () => {
        const state = get()
        const cost = costForLevel(NEBULA_UPGRADES.ftl, state.ftlLevel)
        if (state.nebulas.amount < cost) return false
        set({ nebulas: spend(state.nebulas, cost), ftlLevel: state.ftlLevel + 1 })
        return true
      },

      resetPrestige: () => set({ ...initialState }),
    }),
    {
      name: 'grafity-prestige-v1',
      version: 2,
      /** v1 saves stored the FTL upgrade as speedOfLightLevel (its old name) — carry it over so existing players keep their levels. */
      migrate: (persisted) => {
        const state = persisted as Partial<PrestigeState> & { speedOfLightLevel?: number }
        if (state.ftlLevel === undefined && typeof state.speedOfLightLevel === 'number') {
          state.ftlLevel = state.speedOfLightLevel
          delete state.speedOfLightLevel
        }
        return state
      },
    },
  ),
)
