import { computeDiscoveryReward } from '../currency/rules'
import { revealAroundNode } from '../discovery/reveal'
import type { DiscoveryState } from '../discovery/types'
import type { Graph, NodeId } from '../graph/types'
import { nextHopToward, uniformWeight } from '../strategies/pathfinding'
import { moveWalker } from '../walker/walkerLogic'
import type { WalkerState } from '../walker/types'
import { DEFAULT_REWARD_RATES } from './searcherStep'
import type { RewardRates } from './searcherStep'

/** Same node, adjacent, or one has physically crossed the other's path — any of these counts as the two walkers finding each other. */
export function hasMet(graph: Graph, walker: WalkerState, walker2: WalkerState): boolean {
  if (walker.currentNodeId === walker2.currentNodeId) return true
  if (graph.adjacency[walker.currentNodeId]?.includes(walker2.currentNodeId)) return true
  return walker.path.includes(walker2.currentNodeId) || walker2.path.includes(walker.currentNodeId)
}

/** Pure: the nearest-by-hops node this walker's half of the graph hasn't visited yet, or null if nothing unvisited is reachable (its side has no territory left). */
export function decideBidirectionalHop(graph: Graph, discovery: DiscoveryState, walker: WalkerState): NodeId | null {
  return nextHopToward(graph, walker.currentNodeId, (id) => !discovery.visitedNodeIds.has(id), uniformWeight)
}

export interface CommitBidirectionalHopInput {
  graph: Graph
  discovery: DiscoveryState
  walker: WalkerState
  nextNodeId: NodeId
  rewardRates?: RewardRates
}

export interface CommitBidirectionalHopResult {
  walker: WalkerState
  discovery: DiscoveryState
  wasAlreadyVisited: boolean
  currencyEarned: number
}

/** Pure: the "arrival" half — reveal, moveWalker, reward math. No single goal node for either half, so hasReachedGoal stays false throughout; "met" is tracked separately via hasMet. */
export function commitBidirectionalHop(input: CommitBidirectionalHopInput): CommitBidirectionalHopResult {
  const rewardRates = input.rewardRates ?? DEFAULT_REWARD_RATES
  const wasAlreadyVisited = input.discovery.visitedNodeIds.has(input.nextNodeId)
  const movedWalker = moveWalker(input.walker, input.nextNodeId, '')
  const revealResult = revealAroundNode(input.discovery, input.graph, input.nextNodeId)
  const currencyEarned = wasAlreadyVisited
    ? rewardRates.revisit
    : computeDiscoveryReward(revealResult.newlyDiscoveredNodeCount, rewardRates.discoveryPerNode)

  return { walker: movedWalker, discovery: revealResult.discovery, wasAlreadyVisited, currencyEarned }
}
