import { computeDiscoveryReward, computeGoalBonus, DISCOVERY_REWARD_PER_NODE, GOAL_REWARD_PER_NODE, REVISIT_REWARD } from '../currency/rules'
import { revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import type { StrategyContext, TraversalStrategy } from '../strategies/types'
import { moveWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'

/** The currently-effective reward rates — distinct from the base constants in currency/rules once Discovery/Revisit/Exit Bonus are purchased. */
export interface RewardRates {
  discoveryPerNode: number
  revisit: number
  goalPerNode: number
}

const DEFAULT_REWARD_RATES: RewardRates = {
  discoveryPerNode: DISCOVERY_REWARD_PER_NODE,
  revisit: REVISIT_REWARD,
  goalPerNode: GOAL_REWARD_PER_NODE,
}

export interface MultiSearcherTickInput {
  graph: Graph
  walkers: WalkerState[]
  discovery: DiscoveryState
  strategy: TraversalStrategy
  /** Per-walker scratch state (e.g. DFS's backtracking stack) — never pooled, each searcher keeps its own. */
  strategyMemories: unknown[]
  /** The pooled Node Memory window every searcher reads and appends to, so "sharing memory" means literally seeing each other's recent steps. */
  sharedRecentPath: NodeId[]
  memoryLevel: number
  /** Defaults to the base rates in currency/rules — callers with Discovery/Revisit/Exit Bonus purchased pass the current effective rates instead. */
  rewardRates?: RewardRates
}

export interface MultiSearcherTickResult {
  walkers: WalkerState[]
  discovery: DiscoveryState
  strategyMemories: unknown[]
  sharedRecentPath: NodeId[]
  goalReached: boolean
  currencyEarned: number
}

/**
 * Steps every searcher once, in order, against one shared discovery state and one shared Node
 * Memory pool. Earlier searchers in the same tick are visible to later ones immediately — each
 * appends its own PRE-MOVE position to sharedRecentPath before the next searcher decides, which
 * is also what makes this exactly reproduce single-searcher behavior when only one walker is
 * active (sharedRecentPath then plays the same role walker.path always has).
 */
export function runMultiSearcherTick(input: MultiSearcherTickInput): MultiSearcherTickResult {
  const rewardRates = input.rewardRates ?? DEFAULT_REWARD_RATES
  const walkers: WalkerState[] = []
  const strategyMemories: unknown[] = []
  let discovery = input.discovery
  let sharedRecentPath = input.sharedRecentPath
  let currencyEarned = 0
  let goalReached = false

  for (let i = 0; i < input.walkers.length; i++) {
    const walker = input.walkers[i]
    const memory = input.strategyMemories[i]

    if (walker.hasReachedGoal) {
      walkers.push(walker)
      strategyMemories.push(memory)
      goalReached = true
      continue
    }

    const ctx: StrategyContext = {
      graph: input.graph,
      discovery,
      walker: { ...walker, path: [...sharedRecentPath, walker.currentNodeId] },
      memory,
      memoryLevel: input.memoryLevel,
    }
    const nextNodeId = input.strategy.chooseNextNode(ctx)
    const wasAlreadyVisited = discovery.visitedNodeIds.has(nextNodeId)
    const movedWalker = moveWalker(walker, nextNodeId, input.graph.goalNodeId)
    const revealResult = revealAroundNode(discovery, input.graph, nextNodeId)
    discovery = revealResult.discovery

    let earned = wasAlreadyVisited
      ? rewardRates.revisit
      : computeDiscoveryReward(revealResult.newlyDiscoveredNodeCount, rewardRates.discoveryPerNode)
    if (movedWalker.hasReachedGoal) {
      earned += computeGoalBonus(input.graph, rewardRates.goalPerNode)
      goalReached = true
    }
    currencyEarned += earned

    sharedRecentPath = [...sharedRecentPath, walker.currentNodeId]
    walkers.push(movedWalker)
    strategyMemories.push(ctx.memory)
  }

  return { walkers, discovery, strategyMemories, sharedRecentPath, goalReached, currencyEarned }
}
