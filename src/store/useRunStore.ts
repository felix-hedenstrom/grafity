import { create } from 'zustand'
import { evaluateAchievements } from '../game/achievements/evaluate'
import type { AchievementContext } from '../game/achievements/types'
import { computeDiscoveryRewardPerNode, computeGoalRewardPerNode, computeInsightMultiplier, computeRevisitReward } from '../game/currency/rules'
import { createDiscovery, revealAroundNode } from '../game/discovery/reveal'
import type { DiscoveryState } from '../game/discovery/types'
import { generatePlanarGraph } from '../game/graph/generatePlanar'
import type { Graph } from '../game/graph/types'
import type { NodeId } from '../game/graph/types'
import { runBidirectionalTick } from '../game/loop/bidirectionalTick'
import { runMultiSearcherTick } from '../game/loop/multiSearcherTick'
import type { RewardRates } from '../game/loop/multiSearcherTick'
import { bidirectionalSearch, getStrategy } from '../game/strategies'
import { computeEffectiveMemoryLevel } from '../game/strategies/memory'
import { DEFAULT_STRATEGY_ID } from '../game/upgrades/definitions'
import { createWalker } from '../game/walker/walkerLogic'
import type { WalkerState } from '../game/walker/types'
import { useAchievementStore } from './useAchievementStore'
import { useProgressionStore } from './useProgressionStore'

/** The currently-effective reward rates, reflecting however many Discovery/Revisit/Exit Bonus levels are owned. */
function computeRewardRates(progression: ReturnType<typeof useProgressionStore.getState>): RewardRates {
  return {
    discoveryPerNode: computeDiscoveryRewardPerNode(progression.discoveryBonusLevel),
    revisit: computeRevisitReward(progression.revisitBonusLevel),
    goalPerNode: computeGoalRewardPerNode(progression.exitBonusLevel),
  }
}

/** Checks every achievement against the latest state and unlocks any that newly qualify — called once per tick, after progression has settled (currency earned, graph grown), so a milestone crossed this tick unlocks immediately. */
function checkAchievements(discovery: DiscoveryState, totalNodes: number): void {
  const progression = useProgressionStore.getState()
  const ctx: AchievementContext = {
    highestGraphNodeCount: progression.highestGraphNodeCount,
    purchasedUpgradeIds: progression.purchasedUpgradeIds,
    activeStrategyId: progression.activeStrategyId,
    defaultStrategyId: DEFAULT_STRATEGY_ID,
    momentumLevel: progression.momentumLevel,
    memoryLevel: progression.memoryLevel,
    deepMemoryLevel: progression.deepMemoryLevel,
    expansionLevel: progression.expansionLevel,
    amplifierLevel: progression.amplifierLevel,
    quickStepsLevel: progression.quickStepsLevel,
    searcherLevel: progression.searcherLevel,
    clarityLevel: progression.clarityLevel,
    currencyAmount: progression.currency.amount,
    discoveredCount: discovery.discoveredNodeIds.size,
    totalNodes,
  }
  const newly = evaluateAchievements(ctx, useAchievementStore.getState().unlockedIds)
  if (newly.length > 0) useAchievementStore.getState().unlockMany(newly)
}

type RunStatus = 'exploring' | 'celebrating'

interface RunState {
  graph: Graph
  /** Every active searcher running the current strategy. Always length 1 + searcherLevel, except while Bidirectional Search is active, where it holds just the start-side walker. */
  walkers: WalkerState[]
  /** Only set while Bidirectional Search is active — the goal-side walker searching toward walkers[0] from the other end. Unaffected by Extra Searcher. */
  walker2: WalkerState | null
  discovery: DiscoveryState
  /** Per-walker scratch state (e.g. DFS's backtracking stack), index-aligned with walkers — never pooled. */
  strategyMemories: unknown[]
  /** The pooled Node Memory window every searcher shares — what makes "Extra Searcher" searchers share memory instead of each remembering their own trail. */
  sharedRecentPath: NodeId[]
  /** Which strategy strategyMemories/sharedRecentPath belong to — lets tick() detect a strategy switch and start fresh instead of handing it another strategy's leftover memory. */
  loadedStrategyId: string
  /** 'celebrating' holds the walkers at the exit for one full tick interval so the UI has time to show it before the graph resets. */
  status: RunStatus
  /** Wall-clock timestamp (Date.now()) the current run began — Momentum compounds on real elapsed time, not tick/step count. */
  runStartedAt: number
  tick: () => void
  resetWithNewGraph: () => void
}

function freshRun(): Pick<
  RunState,
  'graph' | 'walkers' | 'walker2' | 'discovery' | 'strategyMemories' | 'sharedRecentPath' | 'loadedStrategyId' | 'status' | 'runStartedAt'
> {
  const progression = useProgressionStore.getState()
  const graph = generatePlanarGraph(progression.graphNodeCount, undefined, progression.clarityLevel > 0)
  const isBidirectional = progression.activeStrategyId === bidirectionalSearch.id
  const searcherCount = isBidirectional ? 1 : 1 + progression.searcherLevel

  const discovery = isBidirectional
    ? revealAroundNode(createDiscovery(graph, graph.startNodeId), graph, graph.goalNodeId).discovery
    : createDiscovery(graph, graph.startNodeId)

  return {
    graph,
    walkers: Array.from({ length: searcherCount }, () => createWalker(graph.startNodeId)),
    walker2: isBidirectional ? createWalker(graph.goalNodeId) : null,
    discovery,
    strategyMemories: [],
    sharedRecentPath: [],
    loadedStrategyId: progression.activeStrategyId,
    status: 'exploring',
    runStartedAt: Date.now(),
  }
}

export const useRunStore = create<RunState>((set, get) => ({
  ...freshRun(),

  tick: () => {
    const runState = get()

    if (runState.status === 'celebrating') {
      get().resetWithNewGraph()
      return
    }

    const progression = useProgressionStore.getState()

    if (progression.activeStrategyId === bidirectionalSearch.id) {
      // Lazily spawn walker2 if the player switched into Bidirectional mid-run.
      const walker = runState.walkers[0] ?? createWalker(runState.graph.startNodeId)
      const walker2 = runState.walker2 ?? createWalker(runState.graph.goalNodeId)
      const result = runBidirectionalTick({
        graph: runState.graph,
        walker,
        walker2,
        discovery: runState.discovery,
        rewardRates: computeRewardRates(progression),
      })

      set({
        walkers: [result.walker],
        walker2: result.walker2,
        discovery: result.discovery,
        strategyMemories: [],
        sharedRecentPath: [],
        loadedStrategyId: progression.activeStrategyId,
        status: result.met ? 'celebrating' : 'exploring',
      })

      if (result.currencyEarned > 0) {
        progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel))
      }
      if (result.met) {
        progression.growGraph()
      }
      checkAchievements(result.discovery, runState.graph.nodes.length)
      return
    }

    const strategy = getStrategy(progression.activeStrategyId)
    const strategyChanged = progression.activeStrategyId !== runState.loadedStrategyId
    const desiredSearcherCount = 1 + progression.searcherLevel

    let walkers = runState.walkers
    let strategyMemories = runState.strategyMemories
    let sharedRecentPath = runState.sharedRecentPath

    if (strategyChanged) {
      // Starting this strategy fresh — every searcher gets its own new memory, and the shared
      // pool resets since it belonged to whatever strategy was active before.
      walkers = Array.from({ length: desiredSearcherCount }, () => createWalker(runState.graph.startNodeId))
      strategyMemories = walkers.map(() => strategy.createMemory?.())
      sharedRecentPath = []
    } else if (walkers.length < desiredSearcherCount) {
      // Buying Extra Searcher mid-run spawns the new searcher from the start node, already
      // sharing whatever the rest of the pool has discovered.
      const additional = Array.from({ length: desiredSearcherCount - walkers.length }, () => createWalker(runState.graph.startNodeId))
      walkers = [...walkers, ...additional]
      strategyMemories = [...strategyMemories, ...additional.map(() => strategy.createMemory?.())]
    }

    const result = runMultiSearcherTick({
      graph: runState.graph,
      walkers,
      discovery: runState.discovery,
      strategy,
      strategyMemories,
      sharedRecentPath,
      memoryLevel: computeEffectiveMemoryLevel(progression.memoryLevel, progression.deepMemoryLevel, strategy.memoryMultiplier),
      rewardRates: computeRewardRates(progression),
    })

    set({
      walkers: result.walkers,
      walker2: null, // no longer relevant once a non-bidirectional strategy is active
      discovery: result.discovery,
      strategyMemories: result.strategyMemories,
      sharedRecentPath: result.sharedRecentPath,
      loadedStrategyId: progression.activeStrategyId,
      status: result.goalReached ? 'celebrating' : 'exploring',
    })

    if (result.currencyEarned > 0) {
      progression.earnCurrency(result.currencyEarned * computeInsightMultiplier(progression.insightMultiplierLevel))
    }

    if (result.goalReached) {
      progression.growGraph()
    }

    checkAchievements(result.discovery, runState.graph.nodes.length)
  },

  resetWithNewGraph: () => set(freshRun()),
}))
