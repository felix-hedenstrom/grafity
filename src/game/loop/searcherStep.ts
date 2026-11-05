import { PRODUCTION_CONFIG } from '../config/production'
import { computeDiscoveryReward, computeGoalBonus } from '../currency/rules'
import { revealAroundNode } from '../discovery/reveal'
import { forwardTargetNodeId, isExitUnlocked } from '../keys/keys'
import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import type { StrategyContext, TraversalStrategy } from '../strategies/types'
import { moveWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'

/** The currently-effective reward rates — distinct from the base rates in config.currency once Discovery/Revisit/Exit Bonus are purchased. */
export interface RewardRates {
  discoveryPerNode: number
  revisit: number
  goalPerNode: number
}

export const DEFAULT_REWARD_RATES: RewardRates = {
  discoveryPerNode: PRODUCTION_CONFIG.currency.discoveryRewardPerNode,
  revisit: PRODUCTION_CONFIG.currency.revisitReward,
  goalPerNode: PRODUCTION_CONFIG.currency.goalRewardPerNode,
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
  /** This walker's index in the run's walker array (0 = the Spaceship) — threaded into the strategy context for shared-memory strategies. Defaults to 0. */
  walkerIndex?: number
  /** Cross-walker scratch shared by every walker on this strategy — mutated in place by the strategy. */
  sharedMemory?: unknown
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
    walkerIndex: input.walkerIndex ?? 0,
    // A Reverse Beacon walker launched from the exit hunts for the START node — the one
    // destination every strategy can aim at symmetrically (and always already discovered).
    // Forward walkers aim at the remaining keys first, and only at the exit once it's unlocked.
    targetNodeId:
      input.walker.origin === 'goal'
        ? input.graph.startNodeId
        : forwardTargetNodeId(input.graph, input.discovery, input.walker.currentNodeId),
    sharedMemory: input.sharedMemory,
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
  /** Overrides which node counts as "the goal" for hasReachedGoal — pass '' for Reverse Beacon walkers so one of them standing on the exit it launched from never reads as a win. Defaults to the graph's real goal. */
  goalNodeId?: NodeId
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
  const movedWalker = moveWalker(input.walker, input.nextNodeId, input.goalNodeId ?? input.graph.goalNodeId)
  const revealResult = revealAroundNode(input.discovery, input.graph, input.nextNodeId)

  let currencyEarned = wasAlreadyVisited
    ? rewardRates.revisit
    : computeDiscoveryReward(revealResult.newlyDiscoveredNodeCount, rewardRates.discoveryPerNode)
  // A locked exit is just another star: landing on it only wins once every key has been visited,
  // counting this hop (revealResult already marks the landing node visited).
  if (movedWalker.hasReachedGoal && !isExitUnlocked(input.graph, revealResult.discovery)) movedWalker.hasReachedGoal = false
  const goalReached = movedWalker.hasReachedGoal
  if (goalReached) {
    currencyEarned += computeGoalBonus(input.graph, rewardRates.goalPerNode)
  }

  return { walker: movedWalker, discovery: revealResult.discovery, wasAlreadyVisited, currencyEarned, goalReached }
}
