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

export const DEFAULT_REWARD_RATES: RewardRates = {
  discoveryPerNode: DISCOVERY_REWARD_PER_NODE,
  revisit: REVISIT_REWARD,
  goalPerNode: GOAL_REWARD_PER_NODE,
}

export interface DecideHopInput {
  graph: Graph
  discovery: DiscoveryState
  walker: WalkerState
  strategy: TraversalStrategy
  /** This searcher's own scratch state (e.g. DFS's backtracking stack) — mutated in place by the strategy, never pooled. */
  memory: unknown
  memoryLevel: number
  /** The pooled Node Memory window every searcher reads — what makes "sharing memory" mean literally seeing each other's recent steps. */
  sharedRecentPath: NodeId[]
  /** Nodes currently claimed by another walker — passed through to the strategy only while Traffic Control is owned and enabled. */
  excludedNodeIds?: ReadonlySet<NodeId>
}

export interface DecideHopResult {
  nextNodeId: NodeId
  /** Usually the same reference as the input memory (strategies mutate it in place), returned explicitly since a strategy could in principle replace it. */
  memory: unknown
}

/** Pure: asks the strategy where this one searcher goes next, given the current shared Node Memory pool. No state mutation beyond the strategy's own private memory object. */
export function decideNextHop(input: DecideHopInput): DecideHopResult {
  const ctx: StrategyContext = {
    graph: input.graph,
    discovery: input.discovery,
    walker: { ...input.walker, path: [...input.sharedRecentPath, input.walker.currentNodeId] },
    memory: input.memory,
    memoryLevel: input.memoryLevel,
    excludedNodeIds: input.excludedNodeIds,
  }
  const nextNodeId = input.strategy.chooseNextNode(ctx)
  return { nextNodeId, memory: ctx.memory }
}

export interface CommitHopInput {
  graph: Graph
  discovery: DiscoveryState
  walker: WalkerState
  nextNodeId: NodeId
  rewardRates?: RewardRates
}

export interface CommitHopResult {
  walker: WalkerState
  discovery: DiscoveryState
  wasAlreadyVisited: boolean
  currencyEarned: number
  goalReached: boolean
}

/** Pure: the "arrival" half — reveal, moveWalker, reward math. No knowledge of timers or other searchers. */
export function commitHop(input: CommitHopInput): CommitHopResult {
  const rewardRates = input.rewardRates ?? DEFAULT_REWARD_RATES
  const wasAlreadyVisited = input.discovery.visitedNodeIds.has(input.nextNodeId)
  const movedWalker = moveWalker(input.walker, input.nextNodeId, input.graph.goalNodeId)
  const revealResult = revealAroundNode(input.discovery, input.graph, input.nextNodeId)

  let currencyEarned = wasAlreadyVisited
    ? rewardRates.revisit
    : computeDiscoveryReward(revealResult.newlyDiscoveredNodeCount, rewardRates.discoveryPerNode)
  const goalReached = movedWalker.hasReachedGoal
  if (goalReached) {
    currencyEarned += computeGoalBonus(input.graph, rewardRates.goalPerNode)
  }

  return { walker: movedWalker, discovery: revealResult.discovery, wasAlreadyVisited, currencyEarned, goalReached }
}
