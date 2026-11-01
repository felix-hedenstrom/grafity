import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeNodesPerSolve, createCurrency, earn, spend } from '../game/currency/rules'
import type { CurrencyState } from '../game/currency/types'
import {
  BIDIRECTIONAL_THEOREM_COST,
  computeCostMultiplier,
  computeHeadStartInsight,
  computeStartingGraphNodeCount,
  computeTheoremsOnRecompile,
} from '../game/prestige/rules'
import { bidirectionalSearch } from '../game/strategies'
import {
  AMPLIFIER_UPGRADE_INFO,
  CHEAP_PROOFS_UPGRADE_INFO,
  DEEP_MEMORY_UPGRADE_INFO,
  DEEPER_ROOTS_UPGRADE_INFO,
  DEFAULT_STRATEGY_ID,
  EXPANSION_UPGRADE_INFO,
  HEAD_START_UPGRADE_INFO,
  MOMENTUM_UPGRADE_INFO,
  NODE_MEMORY_UPGRADE_INFO,
  QUICK_STEPS_UPGRADE_INFO,
  UPGRADES,
} from '../game/upgrades/definitions'
import { costForLevel } from '../game/upgrades/scaling'

export const STARTING_GRAPH_NODE_COUNT = 7

interface ProgressionState {
  currency: CurrencyState
  /** Earned by Recompiling — spent only on permanent meta-upgrades and Bidirectional Search, never on the regular Insight shop. */
  theorems: CurrencyState
  purchasedUpgradeIds: string[]
  activeStrategyId: string
  bidirectionalUnlocked: boolean
  /** Node count of the level currently being played — may be any size in unlockedLevels, not just the frontier. */
  graphNodeCount: number
  /** Every level (graph size) ever unlocked, ascending, oldest first — index 0 is the current starting size, the last entry is the frontier. */
  unlockedLevels: number[]
  momentumLevel: number
  memoryLevel: number
  expansionLevel: number
  amplifierLevel: number
  deepMemoryLevel: number
  quickStepsLevel: number
  deeperRootsLevel: number
  cheapProofsLevel: number
  headStartLevel: number
  earnCurrency: (amount: number) => void
  purchaseUpgrade: (upgradeId: string) => boolean
  purchaseMomentumLevel: () => boolean
  purchaseMemoryLevel: () => boolean
  purchaseExpansionLevel: () => boolean
  purchaseAmplifierLevel: () => boolean
  purchaseDeepMemoryLevel: () => boolean
  purchaseQuickStepsLevel: () => boolean
  purchaseDeeperRootsLevel: () => boolean
  purchaseCheapProofsLevel: () => boolean
  purchaseHeadStartLevel: () => boolean
  purchaseBidirectional: () => boolean
  setActiveStrategy: (strategyId: string) => void
  /** Switches the currently played level to any size already in unlockedLevels — a no-op if nodeCount was never unlocked. */
  selectLevel: (nodeCount: number) => void
  growGraph: () => void
  /** How many Theorems recompiling right now would grant — 0 means the button is disabled. */
  theoremsAvailable: () => number
  /** The strategic partial reset: keeps algorithm unlocks, Theorems, and every Theorem meta-upgrade; wipes the current run and every Insight-side tunable level. */
  recompile: () => boolean
  resetProgress: () => void
}

function isOwnedStrategy(strategyId: string, purchasedUpgradeIds: string[], bidirectionalUnlocked: boolean): boolean {
  if (strategyId === DEFAULT_STRATEGY_ID) return true
  if (strategyId === bidirectionalSearch.id) return bidirectionalUnlocked
  return UPGRADES.some((upgrade) => upgrade.strategyId === strategyId && purchasedUpgradeIds.includes(upgrade.id))
}

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set, get) => ({
      currency: earn(createCurrency(), computeHeadStartInsight(0)),
      theorems: createCurrency(),
      purchasedUpgradeIds: [],
      activeStrategyId: DEFAULT_STRATEGY_ID,
      bidirectionalUnlocked: false,
      graphNodeCount: STARTING_GRAPH_NODE_COUNT,
      unlockedLevels: [STARTING_GRAPH_NODE_COUNT],
      momentumLevel: 0,
      memoryLevel: 0,
      expansionLevel: 0,
      amplifierLevel: 0,
      deepMemoryLevel: 0,
      quickStepsLevel: 0,
      deeperRootsLevel: 0,
      cheapProofsLevel: 0,
      headStartLevel: 0,

      earnCurrency: (amount) => set((state) => ({ currency: earn(state.currency, amount) })),

      growGraph: () =>
        set((state) => {
          const frontier = state.unlockedLevels[state.unlockedLevels.length - 1]
          // Replaying an already-unlocked level doesn't push the frontier further out.
          if (state.graphNodeCount !== frontier) return {}

          const nextSize = frontier + computeNodesPerSolve(state.expansionLevel, state.amplifierLevel)
          return {
            unlockedLevels: [...state.unlockedLevels, nextSize],
            graphNodeCount: nextSize,
          }
        }),

      selectLevel: (nodeCount) => {
        const state = get()
        if (!state.unlockedLevels.includes(nodeCount)) return
        set({ graphNodeCount: nodeCount })
      },

      purchaseUpgrade: (upgradeId) => {
        const state = get()
        if (state.purchasedUpgradeIds.includes(upgradeId)) return false

        const upgrade = UPGRADES.find((candidate) => candidate.id === upgradeId)
        if (!upgrade) return false
        const cost = Math.round(upgrade.cost * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        // Auto-switch to it only on a player's very first STRATEGY upgrade — a later
        // strategy purchase shouldn't silently yank them off one they already chose.
        const ownedStrategyCount =
          state.purchasedUpgradeIds.filter((id) => UPGRADES.some((candidate) => candidate.id === id)).length +
          (state.bidirectionalUnlocked ? 1 : 0)
        const shouldAutoActivate = ownedStrategyCount === 0

        set({
          currency: spend(state.currency, cost),
          purchasedUpgradeIds: [...state.purchasedUpgradeIds, upgrade.id],
          activeStrategyId: shouldAutoActivate ? (upgrade.strategyId as string) : state.activeStrategyId,
        })
        return true
      },

      purchaseMomentumLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(MOMENTUM_UPGRADE_INFO, state.momentumLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), momentumLevel: state.momentumLevel + 1 })
        return true
      },

      purchaseMemoryLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(NODE_MEMORY_UPGRADE_INFO, state.memoryLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), memoryLevel: state.memoryLevel + 1 })
        return true
      },

      purchaseExpansionLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(EXPANSION_UPGRADE_INFO, state.expansionLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), expansionLevel: state.expansionLevel + 1 })
        return true
      },

      purchaseAmplifierLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(AMPLIFIER_UPGRADE_INFO, state.amplifierLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), amplifierLevel: state.amplifierLevel + 1 })
        return true
      },

      purchaseDeepMemoryLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(DEEP_MEMORY_UPGRADE_INFO, state.deepMemoryLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), deepMemoryLevel: state.deepMemoryLevel + 1 })
        return true
      },

      purchaseQuickStepsLevel: () => {
        const state = get()
        const cost = Math.round(costForLevel(QUICK_STEPS_UPGRADE_INFO, state.quickStepsLevel) * computeCostMultiplier(state.cheapProofsLevel))
        if (state.currency.amount < cost) return false

        set({ currency: spend(state.currency, cost), quickStepsLevel: state.quickStepsLevel + 1 })
        return true
      },

      // The three meta-upgrades below are priced and paid in Theorems — Cheap Proofs' Insight discount doesn't apply to them.

      purchaseDeeperRootsLevel: () => {
        const state = get()
        const cost = costForLevel(DEEPER_ROOTS_UPGRADE_INFO, state.deeperRootsLevel)
        if (state.theorems.amount < cost) return false

        set({ theorems: spend(state.theorems, cost), deeperRootsLevel: state.deeperRootsLevel + 1 })
        return true
      },

      purchaseCheapProofsLevel: () => {
        const state = get()
        const cost = costForLevel(CHEAP_PROOFS_UPGRADE_INFO, state.cheapProofsLevel)
        if (state.theorems.amount < cost) return false

        set({ theorems: spend(state.theorems, cost), cheapProofsLevel: state.cheapProofsLevel + 1 })
        return true
      },

      purchaseHeadStartLevel: () => {
        const state = get()
        const cost = costForLevel(HEAD_START_UPGRADE_INFO, state.headStartLevel)
        if (state.theorems.amount < cost) return false

        set({ theorems: spend(state.theorems, cost), headStartLevel: state.headStartLevel + 1 })
        return true
      },

      purchaseBidirectional: () => {
        const state = get()
        if (state.bidirectionalUnlocked) return false
        if (state.theorems.amount < BIDIRECTIONAL_THEOREM_COST) return false

        const ownedStrategyCount = state.purchasedUpgradeIds.filter((id) =>
          UPGRADES.some((candidate) => candidate.id === id),
        ).length
        const shouldAutoActivate = ownedStrategyCount === 0

        set({
          theorems: spend(state.theorems, BIDIRECTIONAL_THEOREM_COST),
          bidirectionalUnlocked: true,
          activeStrategyId: shouldAutoActivate ? bidirectionalSearch.id : state.activeStrategyId,
        })
        return true
      },

      setActiveStrategy: (strategyId) => {
        const state = get()
        if (!isOwnedStrategy(strategyId, state.purchasedUpgradeIds, state.bidirectionalUnlocked)) return
        set({ activeStrategyId: strategyId })
      },

      theoremsAvailable: () => {
        const state = get()
        const frontier = state.unlockedLevels[state.unlockedLevels.length - 1]
        const baseStart = computeStartingGraphNodeCount(STARTING_GRAPH_NODE_COUNT, state.deeperRootsLevel)
        return computeTheoremsOnRecompile(frontier, baseStart)
      },

      recompile: () => {
        const state = get()
        const earned = get().theoremsAvailable()
        if (earned <= 0) return false

        const startingGraphNodeCount = computeStartingGraphNodeCount(STARTING_GRAPH_NODE_COUNT, state.deeperRootsLevel)

        set({
          theorems: earn(state.theorems, earned),
          currency: earn(createCurrency(), computeHeadStartInsight(state.headStartLevel)),
          graphNodeCount: startingGraphNodeCount,
          unlockedLevels: [startingGraphNodeCount],
          momentumLevel: 0,
          memoryLevel: 0,
          expansionLevel: 0,
          amplifierLevel: 0,
          deepMemoryLevel: 0,
          quickStepsLevel: 0,
          // purchasedUpgradeIds, activeStrategyId, bidirectionalUnlocked, and every
          // Theorem-side meta-upgrade level deliberately survive a Recompile.
        })
        return true
      },

      resetProgress: () =>
        set({
          currency: earn(createCurrency(), computeHeadStartInsight(0)),
          theorems: createCurrency(),
          purchasedUpgradeIds: [],
          activeStrategyId: DEFAULT_STRATEGY_ID,
          bidirectionalUnlocked: false,
          graphNodeCount: STARTING_GRAPH_NODE_COUNT,
          unlockedLevels: [STARTING_GRAPH_NODE_COUNT],
          momentumLevel: 0,
          memoryLevel: 0,
          expansionLevel: 0,
          amplifierLevel: 0,
          deepMemoryLevel: 0,
          quickStepsLevel: 0,
          deeperRootsLevel: 0,
          cheapProofsLevel: 0,
          headStartLevel: 0,
        }),
    }),
    {
      name: 'grafity-save-v1',
      // purchasedUpgradeIds is a plain array (not a Set) specifically so it round-trips through this JSON-based persistence.
    },
  ),
)
