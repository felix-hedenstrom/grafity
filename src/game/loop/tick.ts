import { computeDiscoveryReward, computeGoalBonus, REVISIT_REWARD } from '../currency/rules'
import { revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph } from '../graph/types'
import type { StrategyContext, TraversalStrategy } from '../strategies/types'
import { moveWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'

export interface TickInput {
  graph: Graph
  walker: WalkerState
  discovery: DiscoveryState
  strategy: TraversalStrategy
  memory: unknown
  memoryLevel: number
}

export interface TickResult {
  walker: WalkerState
  discovery: DiscoveryState
  memory: unknown
  goalReached: boolean
  currencyEarned: number
}

export function runTick(input: TickInput): TickResult {
  if (input.walker.hasReachedGoal) {
    return {
      walker: input.walker,
      discovery: input.discovery,
      memory: input.memory,
      goalReached: true,
      currencyEarned: 0,
    }
  }

  const ctx: StrategyContext = {
    graph: input.graph,
    discovery: input.discovery,
    walker: input.walker,
    memory: input.memory,
    memoryLevel: input.memoryLevel,
  }
  const nextNodeId = input.strategy.chooseNextNode(ctx)
  const wasAlreadyVisited = input.discovery.visitedNodeIds.has(nextNodeId)
  const walker = moveWalker(input.walker, nextNodeId, input.graph.goalNodeId)
  const { discovery, newlyDiscoveredNodeCount } = revealAroundNode(input.discovery, input.graph, nextNodeId)

  // Mutually exclusive by construction: a node's neighbors are all revealed the first
  // time you stand on it, so a later revisit can never also newly discover anything.
  let currencyEarned = wasAlreadyVisited ? REVISIT_REWARD : computeDiscoveryReward(newlyDiscoveredNodeCount)
  if (walker.hasReachedGoal) {
    currencyEarned += computeGoalBonus(input.graph)
  }

  return { walker, discovery, memory: input.memory, goalReached: walker.hasReachedGoal, currencyEarned }
}
