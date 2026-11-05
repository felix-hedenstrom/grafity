import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeNodesPerSolve, createCurrency, earn, nebulasForGraphSize, spend } from '../game/currency/rules'
import type { CurrencyState } from '../game/currency/types'
import { DEFAULT_STRATEGY_ID, UPGRADE_INFOS, UPGRADES } from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'
import { PRODUCTION_CONFIG } from '../game/config/production'
import { usePrestigeStore } from './usePrestigeStore'
import { useScannerWiringStore } from './useScannerWiringStore'

/** Mirror of PRODUCTION_CONFIG.progression.startingGraphNodeCount — re-exported so components/tests keep one obvious name for it. */
export const STARTING_GRAPH_NODE_COUNT = PRODUCTION_CONFIG.progression.startingGraphNodeCount
/** Mirror of PRODUCTION_CONFIG.progression.startingMemoryLevel — the free Node Memory every cycle starts with. */
export const STARTING_MEMORY_LEVEL = PRODUCTION_CONFIG.progression.startingMemoryLevel

interface ProgressionState {
  currency: CurrencyState
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  /** The level currently being played — this IS the graph's node count, not a separate index. */
  graphNodeCount: number
  /** The largest graphNodeCount ever reached — bounds how high selectLevel can jump to. */
  highestGraphNodeCount: number
  /** Momentum — a per-cycle one-time unlock, reset by prestige. */
  momentumOwned: boolean
  memoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  deepMemoryLevel: number
  discoverWaitLevel: number
  searcherLevel: number
  thrustersLevel: number
  insightMultiplierLevel: number
  discoveryBonusLevel: number
  revisitBonusLevel: number
  exitBonusLevel: number
  darklyBotServosLevel: number
  /** Pulsar Hunter (see game/loop/pulsarHunter.ts) — a per-cycle one-time unlock with an on/off switch, reset by prestige. */
  pulsarHunterOwned: boolean
  pulsarHunterEnabled: boolean
  /** Exit Avoidance (see game/loop/pulsarHunter.ts) — same per-cycle one-time unlock + switch. */
  exitAvoidanceOwned: boolean
  exitAvoidanceEnabled: boolean
  /** Display preference, independent of OS settings — defaults to dark. */
  themeMode: 'dark' | 'light'
  earnCurrency: (amount: number) => void
  purchaseUpgrade: (upgradeId: string) => boolean
  purchaseMomentum: () => boolean
  purchaseMemoryLevel: () => boolean
  purchaseExpansionLevel: () => boolean
  purchaseAmplifierLevel: () => boolean
  purchaseDeepMemoryLevel: () => boolean
  purchaseDiscoverWaitLevel: () => boolean
  purchaseSearcherLevel: () => boolean
  purchaseThrustersLevel: () => boolean
  purchaseInsightMultiplierLevel: () => boolean
  purchaseDiscoveryBonusLevel: () => boolean
  purchaseRevisitBonusLevel: () => boolean
  purchaseExitBonusLevel: () => boolean
  purchaseDarklyBotServosLevel: () => boolean
  purchasePulsarHunter: () => boolean
  togglePulsarHunter: () => void
  purchaseExitAvoidance: () => boolean
  toggleExitAvoidance: () => void
  toggleTheme: () => void
  setActiveStrategy: (strategyId: string) => void
  /** Jumps the current level to any size from STARTING_GRAPH_NODE_COUNT up to highestGraphNodeCount — a no-op outside that range. Solving from a lower level climbs back up normally and will eventually pass the old high again. */
  selectLevel: (nodeCount: number) => void
  growGraph: () => void
  /** Pays out Nebulas via usePrestigeStore (based on this run's highestGraphNodeCount) and resets every per-cycle upgrade/currency/level back to the start — Nebulas and anything bought in the Prestige Shop are untouched. */
  prestige: () => void
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
      momentumOwned: false,
      memoryLevel: STARTING_MEMORY_LEVEL,
      expansionLevel: 0,
      amplifierLevel: 0,
      deepMemoryLevel: 0,
      discoverWaitLevel: 0,
      searcherLevel: 0,
      thrustersLevel: 0,
      insightMultiplierLevel: 0,
      discoveryBonusLevel: 0,
      revisitBonusLevel: 0,
      exitBonusLevel: 0,
      darklyBotServosLevel: 0,
      pulsarHunterOwned: false,
      pulsarHunterEnabled: false,
      exitAvoidanceOwned: false,
      exitAvoidanceEnabled: false,
      themeMode: 'dark',

      earnCurrency: (amount) => set((state) => ({ currency: earn(state.currency, amount) })),

      growGraph: () =>
        set((state) => {
          const nextSize = state.graphNodeCount + computeNodesPerSolve(state.expansionLevel, state.amplifierLevel)
          usePrestigeStore.getState().bumpLifetimeHighest(nextSize)
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

      purchaseMomentum: () => {
        const state = get()
        const { cost, minLevel } = PRODUCTION_CONFIG.upgrades.momentum
        if (state.momentumOwned || state.highestGraphNodeCount < minLevel || state.currency.amount < cost) return false
        set({ currency: spend(state.currency, cost), momentumOwned: true })
        return true
      },

      purchaseMemoryLevel: () => {
        const state = get()
        if (state.memoryLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.nodeMemory.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.nodeMemory, state.memoryLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), memoryLevel: state.memoryLevel + 1 })
        return true
      },

      purchaseExpansionLevel: () => {
        const state = get()
        if (state.expansionLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.expansion.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.expansion, state.expansionLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), expansionLevel: state.expansionLevel + 1 })
        return true
      },

      purchaseAmplifierLevel: () => {
        const state = get()
        if (state.amplifierLevel >= UPGRADE_INFOS.amplifier.maxLevel!) return false
        if (state.amplifierLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.amplifier.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.amplifier, state.amplifierLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), amplifierLevel: state.amplifierLevel + 1 })
        return true
      },

      purchaseDeepMemoryLevel: () => {
        const state = get()
        if (state.deepMemoryLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.deepMemory.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.deepMemory, state.deepMemoryLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), deepMemoryLevel: state.deepMemoryLevel + 1 })
        return true
      },

      purchaseDiscoverWaitLevel: () => {
        const state = get()
        if (state.discoverWaitLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.discoverWait.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.discoverWait, state.discoverWaitLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), discoverWaitLevel: state.discoverWaitLevel + 1 })
        return true
      },

      purchaseSearcherLevel: () => {
        const state = get()
        if (
          state.searcherLevel === 0 &&
          (state.highestGraphNodeCount < UPGRADE_INFOS.searcher.minLevel || !usePrestigeStore.getState().unlockUfoOwned)
        )
          return false
        const cost = costForLevel(UPGRADE_INFOS.searcher, state.searcherLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), searcherLevel: state.searcherLevel + 1 })
        return true
      },

      purchaseThrustersLevel: () => {
        const state = get()
        if (state.thrustersLevel >= UPGRADE_INFOS.thrusters.maxLevel!) return false
        if (state.thrustersLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.thrusters.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.thrusters, state.thrustersLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), thrustersLevel: state.thrustersLevel + 1 })
        return true
      },

      purchaseInsightMultiplierLevel: () => {
        const state = get()
        if (state.insightMultiplierLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.insightMultiplier.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.insightMultiplier, state.insightMultiplierLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), insightMultiplierLevel: state.insightMultiplierLevel + 1 })
        return true
      },

      purchaseDiscoveryBonusLevel: () => {
        const state = get()
        if (state.discoveryBonusLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.discoveryBonus.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.discoveryBonus, state.discoveryBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), discoveryBonusLevel: state.discoveryBonusLevel + 1 })
        return true
      },

      purchaseRevisitBonusLevel: () => {
        const state = get()
        if (state.revisitBonusLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.revisitBonus.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.revisitBonus, state.revisitBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), revisitBonusLevel: state.revisitBonusLevel + 1 })
        return true
      },

      purchaseExitBonusLevel: () => {
        const state = get()
        if (state.exitBonusLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.exitBonus.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.exitBonus, state.exitBonusLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), exitBonusLevel: state.exitBonusLevel + 1 })
        return true
      },

      purchaseDarklyBotServosLevel: () => {
        const state = get()
        if (state.darklyBotServosLevel >= UPGRADE_INFOS.darklyBotServos.maxLevel!) return false
        if (state.darklyBotServosLevel === 0 && state.highestGraphNodeCount < UPGRADE_INFOS.darklyBotServos.minLevel) return false
        const cost = costForLevel(UPGRADE_INFOS.darklyBotServos, state.darklyBotServosLevel)
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), darklyBotServosLevel: state.darklyBotServosLevel + 1 })
        return true
      },

      purchasePulsarHunter: () => {
        const state = get()
        const { cost, minLevel } = PRODUCTION_CONFIG.upgrades.pulsarHunter
        if (state.pulsarHunterOwned || state.highestGraphNodeCount < minLevel || state.currency.amount < cost) return false
        set({ currency: spend(state.currency, cost), pulsarHunterOwned: true, pulsarHunterEnabled: true })
        return true
      },

      togglePulsarHunter: () => set((state) => ({ pulsarHunterEnabled: state.pulsarHunterOwned && !state.pulsarHunterEnabled })),

      purchaseExitAvoidance: () => {
        const state = get()
        const { cost, minLevel } = PRODUCTION_CONFIG.upgrades.exitAvoidance
        if (state.exitAvoidanceOwned || state.highestGraphNodeCount < minLevel || state.currency.amount < cost) return false
        set({ currency: spend(state.currency, cost), exitAvoidanceOwned: true, exitAvoidanceEnabled: true })
        return true
      },

      toggleExitAvoidance: () => set((state) => ({ exitAvoidanceEnabled: state.exitAvoidanceOwned && !state.exitAvoidanceEnabled })),

      toggleTheme: () => set((state) => ({ themeMode: state.themeMode === 'dark' ? 'light' : 'dark' })),

      setActiveStrategy: (strategyId) => {
        const state = get()
        if (!isOwnedStrategy(strategyId, state.purchasedUpgradeIds)) return
        set({ activeStrategyId: strategyId })
      },

      prestige: () => {
        const state = get()
        const nebulasEarned = nebulasForGraphSize(state.highestGraphNodeCount)
        usePrestigeStore.getState().recordPrestige(nebulasEarned, state.highestGraphNodeCount)
        set({
          currency: createCurrency(),
          purchasedUpgradeIds: [],
          activeStrategyId: DEFAULT_STRATEGY_ID,
          graphNodeCount: STARTING_GRAPH_NODE_COUNT,
          highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
          momentumOwned: false,
          memoryLevel: STARTING_MEMORY_LEVEL,
          expansionLevel: 0,
          amplifierLevel: 0,
          deepMemoryLevel: 0,
          discoverWaitLevel: 0,
          searcherLevel: 0,
          thrustersLevel: 0,
          insightMultiplierLevel: 0,
          discoveryBonusLevel: 0,
          revisitBonusLevel: 0,
          exitBonusLevel: 0,
          darklyBotServosLevel: 0,
          pulsarHunterOwned: false,
          pulsarHunterEnabled: false,
          exitAvoidanceOwned: false,
          exitAvoidanceEnabled: false,
        })
        useScannerWiringStore.getState().reset()
      },

      resetProgress: () => {
        useScannerWiringStore.getState().reset()
        set({
          currency: createCurrency(),
          purchasedUpgradeIds: [],
          activeStrategyId: DEFAULT_STRATEGY_ID,
          graphNodeCount: STARTING_GRAPH_NODE_COUNT,
          highestGraphNodeCount: STARTING_GRAPH_NODE_COUNT,
          momentumOwned: false,
          memoryLevel: STARTING_MEMORY_LEVEL,
          expansionLevel: 0,
          amplifierLevel: 0,
          deepMemoryLevel: 0,
          discoverWaitLevel: 0,
          searcherLevel: 0,
          thrustersLevel: 0,
          insightMultiplierLevel: 0,
          discoveryBonusLevel: 0,
          revisitBonusLevel: 0,
          exitBonusLevel: 0,
          darklyBotServosLevel: 0,
          pulsarHunterOwned: false,
          pulsarHunterEnabled: false,
          exitAvoidanceOwned: false,
          exitAvoidanceEnabled: false,
          themeMode: 'dark',
        })
      },
    }),
    {
      name: 'grafity-save-v1',
      // purchasedUpgradeIds is a plain array (not a Set) specifically so it round-trips through this JSON-based persistence.
      version: 3,
      /** v0 saves may own algorithms that have since left the ladder — Bidirectional Search (now
       * the Reverse Beacon prestige upgrade) and Least Visited Path (removed). Strip them and
       * refund their old Insight price so nobody is silently robbed, and move anyone actively
       * using one onto the nearest surviving strategy they own. v0/v1 saves predate the free
       * starting Node Memory level — top them up to it. v0–v2 saves had repeatable Momentum levels — any level
       * owned becomes the one-time unlock. */
      migrate: (persisted) => {
        const state = persisted as {
          purchasedUpgradeIds?: string[]
          activeStrategyId?: string
          currency?: { amount: number }
          memoryLevel?: number
          momentumLevel?: number
          momentumOwned?: boolean
        }
        if (state.momentumLevel !== undefined) {
          state.momentumOwned = state.momentumLevel > 0
          delete state.momentumLevel
        }
        state.memoryLevel = Math.max(state.memoryLevel ?? 0, STARTING_MEMORY_LEVEL)
        const removed: Record<string, { refund: number; fallback: string }> = {
          bidirectional: { refund: 20000, fallback: 'a-star' },
          'least-visited-path': { refund: 300, fallback: 'least-visited-star' },
        }
        for (const [id, { refund, fallback }] of Object.entries(removed)) {
          if (!state.purchasedUpgradeIds?.includes(id)) continue
          state.purchasedUpgradeIds = state.purchasedUpgradeIds.filter((owned) => owned !== id)
          if (state.currency) state.currency = { ...state.currency, amount: state.currency.amount + refund }
          if (state.activeStrategyId === id) {
            state.activeStrategyId = state.purchasedUpgradeIds.includes(fallback) ? fallback : DEFAULT_STRATEGY_ID
          }
        }
        return state
      },
    },
  ),
)
