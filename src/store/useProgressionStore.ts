import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeNodesPerSolve, createCurrency, earn, spend } from '../game/currency/rules'
import type { CurrencyState } from '../game/currency/types'
import { CLARITY_MAX_LEVEL } from '../game/graph/generatePlanar'
import {
  AMPLIFIER_UPGRADE_INFO,
  CLARITY_UPGRADE,
  DEEP_MEMORY_UPGRADE_INFO,
  DEFAULT_STRATEGY_ID,
  DISCOVER_WAIT_UPGRADE_INFO,
  DISCOVERY_BONUS_UPGRADE_INFO,
  EXIT_BONUS_UPGRADE_INFO,
  EXPANSION_UPGRADE_INFO,
  INSIGHT_MULTIPLIER_UPGRADE_INFO,
  MAIN_WALKER_SPEED_UPGRADE_INFO,
  MINIMAP_UPGRADE,
  MOMENTUM_UPGRADE_INFO,
  MUTEX_UPGRADE,
  NODE_MEMORY_UPGRADE_INFO,
  QUICK_STEPS_UPGRADE_INFO,
  REVISIT_BONUS_UPGRADE_INFO,
  SEARCHER_UPGRADE_INFO,
  UFO_SPEED_UPGRADE_INFO,
  UNLOCK_UFO_UPGRADE,
  UPGRADES,
} from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'

export const STARTING_GRAPH_NODE_COUNT = 7

interface ProgressionState {
  currency: CurrencyState
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  /** The level currently being played — this IS the graph's node count, not a separate index. */
  graphNodeCount: number
  /** The largest graphNodeCount ever reached — bounds how high selectLevel can jump to. */
  highestGraphNodeCount: number
  momentumLevel: number
  memoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  deepMemoryLevel: number
  quickStepsLevel: number
  discoverWaitLevel: number
  searcherLevel: number
  mainWalkerSpeedLevel: number
  ufoSpeedLevel: number
  clarityLevel: number
  insightMultiplierLevel: number
  discoveryBonusLevel: number
  revisitBonusLevel: number
  exitBonusLevel: number
  /** Whether the minimap is currently shown — only meaningful once 'minimap' is in purchasedUpgradeIds; toggled freely afterward, no re-purchase needed. */
  minimapEnabled: boolean
  /** Whether Traffic Control's node/edge mutex is currently enforced — only meaningful once 'mutex' is in purchasedUpgradeIds; toggled freely afterward, no re-purchase needed. */
  mutexEnabled: boolean
  /** Display preference, independent of OS settings — defaults to dark. */
  themeMode: 'dark' | 'light'
  earnCurrency: (amount: number) => void
  purchaseUpgrade: (upgradeId: string) => boolean
  purchaseMomentumLevel: () => boolean
  purchaseMemoryLevel: () => boolean
  purchaseExpansionLevel: () => boolean
  purchaseAmplifierLevel: () => boolean
  purchaseDeepMemoryLevel: () => boolean
  purchaseQuickStepsLevel: () => boolean
  purchaseDiscoverWaitLevel: () => boolean
  purchaseSearcherLevel: () => boolean
  purchaseMainWalkerSpeedLevel: () => boolean
  purchaseUfoSpeedLevel: () => boolean
  purchaseInsightMultiplierLevel: () => boolean
  purchaseDiscoveryBonusLevel: () => boolean
  purchaseRevisitBonusLevel: () => boolean
  purchaseExitBonusLevel: () => boolean
  purchaseClarity: () => boolean
  purchaseMinimap: () => boolean
  toggleMinimap: () => void
  purchaseUnlockUfo: () => boolean
  purchaseMutex: () => boolean
  toggleMutex: () => void
  toggleTheme: () => void
  setActiveStrategy: (strategyId: string) => void
  /** Jumps the current level to any size from STARTING_GRAPH_NODE_COUNT up to highestGraphNodeCount — a no-op outside that range. Solving from a lower level climbs back up normally and will eventually pass the old high again. */
  selectLevel: (nodeCount: number) => void
  growGraph: () => void
  resetProgress: () => void
}

function isOwnedStrategy(strategyId: string, purchasedUpgradeIds: string[]): boolean {
  if (strategyId === DEFAULT_STRATEGY_ID) return true
  return UPGRADES.some((upgrade) => upgrade.strategyId === strategyId && purchasedUpgradeIds.includes(upgrade.id))
}

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set, get) => ({
      currency: createCurrency(),
      purchasedUpgradeIds: [],
      activeStrategyId: DEFAULT_STRATEGY_ID,
      graphNodeCount: STARTING_GRAPH_NODE_COUNT,
      highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
      momentumLevel: 0,
      memoryLevel: 0,
      expansionLevel: 0,
      amplifierLevel: 0,
      deepMemoryLevel: 0,
      quickStepsLevel: 0,
      discoverWaitLevel: 0,
      searcherLevel: 0,
      mainWalkerSpeedLevel: 0,
      ufoSpeedLevel: 0,
      clarityLevel: 0,
      insightMultiplierLevel: 0,
      discoveryBonusLevel: 0,
      revisitBonusLevel: 0,
      exitBonusLevel: 0,
      minimapEnabled: true,
      mutexEnabled: false,
      themeMode: 'dark',

      earnCurrency: (amount) => set((state) => ({ currency: earn(state.currency, amount) })),

      growGraph: () =>
        set((state) => {
          const nextSize = state.graphNodeCount + computeNodesPerSolve(state.expansionLevel, state.amplifierLevel)
          return {
            graphNodeCount: nextSize,
            highestGraphNodeCount: Math.max(state.highestGraphNodeCount, nextSize),
          }
        }),

      selectLevel: (nodeCount) => {
        const state = get()
        if (!Number.isInteger(nodeCount)) return
        if (nodeCount < STARTING_GRAPH_NODE_COUNT || nodeCount > state.highestGraphNodeCount) return
        set({ graphNodeCount: nodeCount })
      },

      purchaseUpgrade: (upgradeId) => {
        const state = get()
        if (state.purchasedUpgradeIds.includes(upgradeId)) return false

        const upgrade = UPGRADES.find((candidate) => candidate.id === upgradeId)
        if (!upgrade || state.currency.amount < upgrade.cost || state.highestGraphNodeCount < upgrade.minLevel) return false

        // Auto-switch to it only on a player's very first STRATEGY upgrade — a later
        // strategy purchase shouldn't silently yank them off one they already chose.
        const ownedStrategyCount = state.purchasedUpgradeIds.filter((id) =>
          UPGRADES.some((candidate) => candidate.id === id),
        ).length
        const shouldAutoActivate = ownedStrategyCount === 0

        set({
          currency: spend(state.currency, upgrade.cost),
          purchasedUpgradeIds: [...state.purchasedUpgradeIds, upgrade.id],
          activeStrategyId: shouldAutoActivate ? (upgrade.strategyId as string) : state.activeStrategyId,
        })
        return true
      },

      purchaseMomentumLevel: () => {
        const state = get()
        if (state.momentumLevel === 0 && state.highestGraphNodeCount < MOMENTUM_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(MOMENTUM_UPGRADE_INFO, state.momentumLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), momentumLevel: state.momentumLevel + 1 })
        return true
      },

      purchaseMemoryLevel: () => {
        const state = get()
        if (state.memoryLevel === 0 && state.highestGraphNodeCount < NODE_MEMORY_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(NODE_MEMORY_UPGRADE_INFO, state.memoryLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), memoryLevel: state.memoryLevel + 1 })
        return true
      },

      purchaseExpansionLevel: () => {
        const state = get()
        if (state.expansionLevel === 0 && state.highestGraphNodeCount < EXPANSION_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(EXPANSION_UPGRADE_INFO, state.expansionLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), expansionLevel: state.expansionLevel + 1 })
        return true
      },

      purchaseAmplifierLevel: () => {
        const state = get()
        if (state.amplifierLevel === 0 && state.highestGraphNodeCount < AMPLIFIER_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(AMPLIFIER_UPGRADE_INFO, state.amplifierLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), amplifierLevel: state.amplifierLevel + 1 })
        return true
      },

      purchaseDeepMemoryLevel: () => {
        const state = get()
        if (state.deepMemoryLevel === 0 && state.highestGraphNodeCount < DEEP_MEMORY_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(DEEP_MEMORY_UPGRADE_INFO, state.deepMemoryLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), deepMemoryLevel: state.deepMemoryLevel + 1 })
        return true
      },

      purchaseQuickStepsLevel: () => {
        const state = get()
        if (state.quickStepsLevel === 0 && state.highestGraphNodeCount < QUICK_STEPS_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(QUICK_STEPS_UPGRADE_INFO, state.quickStepsLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), quickStepsLevel: state.quickStepsLevel + 1 })
        return true
      },

      purchaseDiscoverWaitLevel: () => {
        const state = get()
        if (state.discoverWaitLevel === 0 && state.highestGraphNodeCount < DISCOVER_WAIT_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(DISCOVER_WAIT_UPGRADE_INFO, state.discoverWaitLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), discoverWaitLevel: state.discoverWaitLevel + 1 })
        return true
      },

      purchaseSearcherLevel: () => {
        const state = get()
        if (
          state.searcherLevel === 0 &&
          (state.highestGraphNodeCount < SEARCHER_UPGRADE_INFO.minLevel || !state.purchasedUpgradeIds.includes(UNLOCK_UFO_UPGRADE.id))
        )
          return false
        const cost = costForLevel(SEARCHER_UPGRADE_INFO, state.searcherLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), searcherLevel: state.searcherLevel + 1 })
        return true
      },

      purchaseMainWalkerSpeedLevel: () => {
        const state = get()
        // Gated behind owning Extra Searcher too, in addition to minLevel — it has nothing to
        // speed past until there's at least one other walker to outrun.
        if (state.mainWalkerSpeedLevel === 0 && (state.highestGraphNodeCount < MAIN_WALKER_SPEED_UPGRADE_INFO.minLevel || state.searcherLevel === 0))
          return false
        const cost = costForLevel(MAIN_WALKER_SPEED_UPGRADE_INFO, state.mainWalkerSpeedLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), mainWalkerSpeedLevel: state.mainWalkerSpeedLevel + 1 })
        return true
      },

      purchaseUfoSpeedLevel: () => {
        const state = get()
        if (state.ufoSpeedLevel >= UFO_SPEED_UPGRADE_INFO.maxLevel!) return false
        if (state.ufoSpeedLevel === 0 && state.highestGraphNodeCount < UFO_SPEED_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(UFO_SPEED_UPGRADE_INFO, state.ufoSpeedLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), ufoSpeedLevel: state.ufoSpeedLevel + 1 })
        return true
      },

      purchaseInsightMultiplierLevel: () => {
        const state = get()
        if (state.insightMultiplierLevel === 0 && state.highestGraphNodeCount < INSIGHT_MULTIPLIER_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(INSIGHT_MULTIPLIER_UPGRADE_INFO, state.insightMultiplierLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), insightMultiplierLevel: state.insightMultiplierLevel + 1 })
        return true
      },

      purchaseDiscoveryBonusLevel: () => {
        const state = get()
        if (state.discoveryBonusLevel === 0 && state.highestGraphNodeCount < DISCOVERY_BONUS_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(DISCOVERY_BONUS_UPGRADE_INFO, state.discoveryBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), discoveryBonusLevel: state.discoveryBonusLevel + 1 })
        return true
      },

      purchaseRevisitBonusLevel: () => {
        const state = get()
        if (state.revisitBonusLevel === 0 && state.highestGraphNodeCount < REVISIT_BONUS_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(REVISIT_BONUS_UPGRADE_INFO, state.revisitBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), revisitBonusLevel: state.revisitBonusLevel + 1 })
        return true
      },

      purchaseExitBonusLevel: () => {
        const state = get()
        if (state.exitBonusLevel === 0 && state.highestGraphNodeCount < EXIT_BONUS_UPGRADE_INFO.minLevel) return false
        const cost = costForLevel(EXIT_BONUS_UPGRADE_INFO, state.exitBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), exitBonusLevel: state.exitBonusLevel + 1 })
        return true
      },

      purchaseClarity: () => {
        const state = get()
        if (state.clarityLevel > 0) return false
        if (state.currency.amount < CLARITY_UPGRADE.cost || state.highestGraphNodeCount < CLARITY_UPGRADE.minLevel) return false

        set({ currency: spend(state.currency, CLARITY_UPGRADE.cost), clarityLevel: CLARITY_MAX_LEVEL })
        return true
      },

      purchaseMinimap: () => {
        const state = get()
        if (state.purchasedUpgradeIds.includes(MINIMAP_UPGRADE.id)) return false
        if (state.currency.amount < MINIMAP_UPGRADE.cost || state.highestGraphNodeCount < MINIMAP_UPGRADE.minLevel) return false

        set({
          currency: spend(state.currency, MINIMAP_UPGRADE.cost),
          purchasedUpgradeIds: [...state.purchasedUpgradeIds, MINIMAP_UPGRADE.id],
        })
        return true
      },

      toggleMinimap: () => set((state) => ({ minimapEnabled: !state.minimapEnabled })),

      purchaseUnlockUfo: () => {
        const state = get()
        if (state.purchasedUpgradeIds.includes(UNLOCK_UFO_UPGRADE.id)) return false
        if (state.currency.amount < UNLOCK_UFO_UPGRADE.cost || state.highestGraphNodeCount < UNLOCK_UFO_UPGRADE.minLevel) return false

        set({
          currency: spend(state.currency, UNLOCK_UFO_UPGRADE.cost),
          purchasedUpgradeIds: [...state.purchasedUpgradeIds, UNLOCK_UFO_UPGRADE.id],
        })
        return true
      },

      purchaseMutex: () => {
        const state = get()
        if (state.purchasedUpgradeIds.includes(MUTEX_UPGRADE.id)) return false
        if (state.currency.amount < MUTEX_UPGRADE.cost || state.highestGraphNodeCount < MUTEX_UPGRADE.minLevel) return false

        set({
          currency: spend(state.currency, MUTEX_UPGRADE.cost),
          purchasedUpgradeIds: [...state.purchasedUpgradeIds, MUTEX_UPGRADE.id],
        })
        return true
      },

      toggleMutex: () => set((state) => ({ mutexEnabled: !state.mutexEnabled })),

      toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),

      setActiveStrategy: (strategyId) => {
        const state = get()
        if (!isOwnedStrategy(strategyId, state.purchasedUpgradeIds)) return
        set({ activeStrategyId: strategyId })
      },

      resetProgress: () =>
        set({
          currency: createCurrency(),
          purchasedUpgradeIds: [],
          activeStrategyId: DEFAULT_STRATEGY_ID,
          graphNodeCount: STARTING_GRAPH_NODE_COUNT,
          highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
          momentumLevel: 0,
          memoryLevel: 0,
          expansionLevel: 0,
          amplifierLevel: 0,
          deepMemoryLevel: 0,
          quickStepsLevel: 0,
          discoverWaitLevel: 0,
          searcherLevel: 0,
          mainWalkerSpeedLevel: 0,
          ufoSpeedLevel: 0,
          clarityLevel: 0,
          insightMultiplierLevel: 0,
          discoveryBonusLevel: 0,
          revisitBonusLevel: 0,
          exitBonusLevel: 0,
          minimapEnabled: true,
          mutexEnabled: false,
          themeMode: 'dark',
        }),
    }),
    {
      name: 'grafity-save-v1',
      // purchasedUpgradeIds is a plain array (not a Set) specifically so it round-trips through this JSON-based persistence.
    },
  ),
)
